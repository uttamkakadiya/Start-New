// Express entry point for the Start New API and static web client.
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import fileUpload from 'express-fileupload';
import bodyParser from 'body-parser';
import { MongoClient, ObjectId } from 'mongodb';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { v4 as uuid } from 'uuid';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { registerAIRoutes } from './routes/ai.mjs';
import { registerThirdPartyDataRoutes } from './routes/thirdPartyData.mjs';

const scrypt = promisify(scryptCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });
const app = express();
const port = Number(process.env.PORT || 8080);
const api = '/m01064311';
const frontendRoot = path.join(projectRoot, 'frontend');
const uploadRoot = path.join(projectRoot, 'uploads');
const mongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
let db;
let collections;

app.use(bodyParser.json({ limit: '1mb' }));
app.use(
  fileUpload({
    limits: { fileSize: 8 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false,
  })
);
app.use(
  session({
    name: 'startnew.sid',
    secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use('/frontend', express.static(frontendRoot));
app.get('/', (req, res) => res.sendFile(path.join(frontendRoot, 'index.html')));

// Shared route helpers keep input validation and authentication behavior consistent.
const sendError = (res, status, message) => res.status(status).json({ error: message });
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100;
const objectId = (value) => (ObjectId.isValid(value) ? new ObjectId(value) : null);
const cleanString = (value, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const userById = async (id) => collections.users.findOne({ id });

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return sendError(res, 401, 'Please log in to continue.');
  next();
};

const establishSession = (req, userId) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = userId;
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });

const makePasswordHash = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(hash).toString('hex')}`;
};

const verifyPassword = async (password, stored) => {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

const followRecord = async (followerId, followedId) =>
  collections.follows.findOne({ followerId, followedId });

const createNotification = async (recipientId, senderId, type, relatedId = null, message = '') => {
  await collections.notifications.insertOne({
    recipientId,
    senderId,
    type,
    relatedId,
    message,
    read: false,
    createdAt: new Date(),
  });
};

const createFollow = async (followerId, followedId) => {
  if (followerId === followedId) throw new Error('You cannot follow yourself.');
  const existing = await followRecord(followerId, followedId);
  if (!existing) {
    try {
      await collections.follows.insertOne({ followerId, followedId, createdAt: new Date() });
    } catch (error) {
      if (error.code === 11000) return;
      throw error;
    }
    await createNotification(followedId, followerId, 'follow', null, 'started following you');
  }
};

const countsFor = async (userId) => {
  const [followers, following] = await Promise.all([
    collections.follows.countDocuments({ followedId: userId }),
    collections.follows.countDocuments({ followerId: userId }),
  ]);
  return { followers, following };
};

const profileFor = async (user, viewerId = null) => {
  if (!user) return null;
  const [counts, isFollowing, request] = await Promise.all([
    countsFor(user.id),
    viewerId ? followRecord(viewerId, user.id) : null,
    viewerId
      ? collections.followRequests.findOne({
          senderId: viewerId,
          recipientId: user.id,
          status: 'pending',
        })
      : null,
  ]);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: viewerId === user.id ? user.email : undefined,
    bio: user.bio || '',
    interests: user.interests || [],
    role: user.role || '',
    private: Boolean(user.private),
    profilePicture: user.profilePicture || '',
    createdAt: user.createdAt,
    ...counts,
    relationship: viewerId === user.id ? 'self' : isFollowing ? 'following' : request ? 'pending' : 'none',
  };
};

const safeContent = async (content, viewerId) => {
  const creator = await userById(content.creatorId);
  const [likes, comments, saves, bookmarked] = await Promise.all([
    collections.contentLikes.countDocuments({ contentId: content._id.toString() }),
    collections.comments.countDocuments({ contentId: content._id.toString() }),
    collections.bookmarks.countDocuments({ contentId: content._id.toString() }),
    viewerId
      ? collections.bookmarks.findOne({
          userId: viewerId,
          contentId: content._id.toString(),
        })
      : null,
  ]);
  return {
    id: content._id.toString(),
    creatorId: content.creatorId,
    creator: creator
      ? {
          id: creator.id,
          name: creator.name,
          username: creator.username,
          profilePicture: creator.profilePicture || '',
        }
      : null,
    title: content.title,
    description: content.description,
    problem: content.problem || '',
    solution: content.solution || '',
    targetAudience: content.targetAudience || '',
    businessModel: content.businessModel || '',
    category: content.category || 'Other',
    stage: content.stage || 'Idea',
    helpRequired: content.helpRequired || '',
    fundingAmount: content.fundingAmount || '',
    imageUrl: content.imageUrl || '',
    documentUrl: content.documentUrl || '',
    createdAt: content.createdAt,
    likes,
    comments,
    saves,
    bookmarked: Boolean(bookmarked),
  };
};

const handleAsync = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Public profile search and account/session management.
app.get(
  `${api}/users`,
  handleAsync(async (req, res) => {
    const query = cleanString(req.query.q, 100).replace(/^@+/, '').trim();
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = query
      ? {
          $or: [
            { name: { $regex: escapedQuery, $options: 'i' } },
            { username: { $regex: escapedQuery, $options: 'i' } },
            { role: { $regex: escapedQuery, $options: 'i' } },
            { bio: { $regex: escapedQuery, $options: 'i' } },
            { interests: { $regex: escapedQuery, $options: 'i' } },
          ],
        }
      : {};
    const users = await collections.users.find(filter).limit(30).toArray();
    res.json(await Promise.all(users.map((user) => profileFor(user, req.session.userId || null))));
  })
);

app.post(
  `${api}/users`,
  handleAsync(async (req, res) => {
    const { name, username, email, password, bio, interests, role, private: isPrivate } = req.body || {};
    const normalizedEmail = cleanString(email, 254).toLowerCase();
    const normalizedUsername = cleanString(username, 30).toLowerCase();
    if (
      !cleanString(name, 100) ||
      !/^[a-z0-9_]{3,30}$/.test(normalizedUsername) ||
      !isEmail(normalizedEmail) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return sendError(
        res,
        400,
        'Enter a name, valid username and email, and a password between 8 and 128 characters.'
      );
    }
    const user = {
      id: uuid(),
      name: cleanString(name, 100),
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash: await makePasswordHash(password),
      bio: cleanString(bio, 300),
      interests: Array.isArray(interests)
        ? interests
            .map((item) => cleanString(item, 40))
            .filter(Boolean)
            .slice(0, 12)
        : [],
      role: cleanString(role, 80),
      private: Boolean(isPrivate),
      profilePicture: '',
      createdAt: new Date(),
    };
    try {
      await collections.users.insertOne(user);
    } catch (error) {
      if (error.code === 11000) return sendError(res, 409, 'That username or email is already registered.');
      throw error;
    }
    await establishSession(req, user.id);
    res.status(201).json({ user: await profileFor(user, user.id) });
  })
);

app.get(
  `${api}/users/:userId`,
  handleAsync(async (req, res) => {
    const user = await userById(req.params.userId);
    if (!user) return sendError(res, 404, 'User not found.');
    res.json(await profileFor(user, req.session.userId || null));
  })
);

app.get(
  `${api}/login`,
  handleAsync(async (req, res) => {
    if (!req.session.userId) return sendError(res, 401, 'You are not logged in.');
    const user = await userById(req.session.userId);
    if (!user) {
      await new Promise((resolve, reject) => {
        req.session.destroy((error) => (error ? reject(error) : resolve()));
      });
      return sendError(res, 401, 'Your session is no longer valid.');
    }
    res.json({ user: await profileFor(user, user.id) });
  })
);

app.patch(
  `${api}/users/me/privacy`,
  requireAuth,
  handleAsync(async (req, res) => {
    if (typeof req.body?.private !== 'boolean') return sendError(res, 400, 'Choose a valid privacy setting.');
    await collections.users.updateOne({ id: req.session.userId }, { $set: { private: req.body.private } });
    res.json({ user: await profileFor(await userById(req.session.userId), req.session.userId) });
  })
);

app.patch(
  `${api}/users/me`,
  requireAuth,
  handleAsync(async (req, res) => {
    const updates = {};
    if (req.body?.name !== undefined) {
      const name = cleanString(req.body.name, 100);
      if (!name) return sendError(res, 400, 'Your name cannot be empty.');
      updates.name = name;
    }
    if (req.body?.bio !== undefined) updates.bio = cleanString(req.body.bio, 300);
    if (req.body?.role !== undefined) updates.role = cleanString(req.body.role, 80);
    if (req.body?.interests !== undefined) {
      if (!Array.isArray(req.body.interests)) return sendError(res, 400, 'Interests must be a list.');
      updates.interests = req.body.interests
        .map((interest) => cleanString(interest, 40))
        .filter(Boolean)
        .slice(0, 12);
    }
    const hasPasswordChange = ['currentPassword', 'newPassword', 'confirmPassword'].some(
      (field) => req.body?.[field] !== undefined
    );
    if (hasPasswordChange) {
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
        return sendError(res, 400, 'Enter your current password to change it.');
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return sendError(res, 400, 'Your new password must be between 8 and 128 characters.');
      }
      if (typeof confirmPassword !== 'string' || newPassword !== confirmPassword) {
        return sendError(res, 400, 'Your new passwords do not match.');
      }
      const user = await collections.users.findOne({ id: req.session.userId });
      if (!user) return sendError(res, 404, 'User not found.');
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        return sendError(res, 400, 'Your current password is incorrect.');
      }
      updates.passwordHash = await makePasswordHash(newPassword);
    }
    if (Object.keys(updates).length === 0)
      return sendError(res, 400, 'Provide at least one profile field to update.');
    await collections.users.updateOne({ id: req.session.userId }, { $set: updates });
    res.json({ user: await profileFor(await userById(req.session.userId), req.session.userId) });
  })
);

app.post(
  `${api}/login`,
  handleAsync(async (req, res) => {
    const identifier = cleanString(req.body?.identifier, 254).toLowerCase();
    const password = req.body?.password;
    if (!identifier || typeof password !== 'string' || password.length > 128) {
      return sendError(res, 400, 'Enter your email or username and a valid password.');
    }
    const user = await collections.users.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return sendError(res, 401, 'The email/username or password is incorrect.');
    }
    await establishSession(req, user.id);
    res.json({ user: await profileFor(user, user.id) });
  })
);

app.delete(`${api}/login`, (req, res) => {
  req.session.destroy((error) => {
    if (error) return sendError(res, 500, 'Could not end the session.');
    res.clearCookie('startnew.sid');
    res.json({ message: 'You have been logged out.' });
  });
});

// Idea CRUD and search; the signed-in feed below is limited to followed creators.
app.get(
  `${api}/contents`,
  requireAuth,
  handleAsync(async (req, res) => {
    const query = cleanString(req.query.q, 120);
    const category = cleanString(req.query.category, 80);
    const stage = cleanString(req.query.stage, 80);
    const terms = [];
    if (query)
      terms.push({
        $or: ['title', 'description', 'problem', 'solution', 'targetAudience'].map((field) => ({
          [field]: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        })),
      });
    if (category) terms.push({ category });
    if (stage) terms.push({ stage });
    const items = await collections.contents
      .find(terms.length ? { $and: terms } : {})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(await Promise.all(items.map((item) => safeContent(item, req.session.userId || null))));
  })
);

app.get(
  `${api}/users/:userId/contents`,
  handleAsync(async (req, res) => {
    const profile = await userById(req.params.userId);
    if (!profile) return sendError(res, 404, 'User not found.');
    const viewerId = req.session.userId || null;
    if (profile.private && viewerId !== profile.id && !(await followRecord(viewerId, profile.id))) {
      return res.json([]);
    }
    const items = await collections.contents
      .find({ creatorId: profile.id })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    res.json(await Promise.all(items.map((item) => safeContent(item, viewerId))));
  })
);

app.post(
  `${api}/contents`,
  requireAuth,
  handleAsync(async (req, res) => {
    const {
      title,
      description,
      problem,
      solution,
      targetAudience,
      businessModel,
      category,
      stage,
      helpRequired,
      fundingAmount,
      imageUrl,
      documentUrl,
    } = req.body || {};
    if (!cleanString(title, 120) || !cleanString(description, 5000)) {
      return sendError(res, 400, 'A title and description are required.');
    }
    const content = {
      creatorId: req.session.userId,
      title: cleanString(title, 120),
      description: cleanString(description, 5000),
      problem: cleanString(problem, 2000),
      solution: cleanString(solution, 2000),
      targetAudience: cleanString(targetAudience, 500),
      businessModel: cleanString(businessModel, 500),
      category: cleanString(category, 80) || 'Other',
      stage: cleanString(stage, 80) || 'Idea',
      helpRequired: cleanString(helpRequired, 300),
      fundingAmount: cleanString(fundingAmount, 100),
      imageUrl: cleanString(imageUrl, 500),
      documentUrl: cleanString(documentUrl, 500),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await collections.contents.insertOne(content);
    res.status(201).json(await safeContent({ ...content, _id: result.insertedId }, req.session.userId));
  })
);

app.put(
  `${api}/contents/:contentId`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const content = await collections.contents.findOne({ _id: id });
    if (!content) return sendError(res, 404, 'Idea not found.');
    if (content.creatorId !== req.session.userId)
      return sendError(res, 403, 'You can only edit your own ideas.');
    const fields = [
      'title',
      'description',
      'problem',
      'solution',
      'targetAudience',
      'businessModel',
      'category',
      'stage',
      'helpRequired',
      'fundingAmount',
      'imageUrl',
      'documentUrl',
    ];
    const update = {};
    for (const field of fields)
      if (req.body?.[field] !== undefined)
        update[field] = cleanString(req.body[field], field === 'description' ? 5000 : 2000);
    if (update.title !== undefined && !update.title)
      return sendError(res, 400, 'Idea title cannot be empty.');
    if (update.description !== undefined && !update.description)
      return sendError(res, 400, 'Idea description cannot be empty.');
    update.updatedAt = new Date();
    await collections.contents.updateOne({ _id: id }, { $set: update });
    res.json(await safeContent({ ...content, ...update }, req.session.userId));
  })
);

app.delete(
  `${api}/contents/:contentId`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const result = await collections.contents.deleteOne({ _id: id, creatorId: req.session.userId });
    if (!result.deletedCount) return sendError(res, 404, 'Idea not found or you do not own it.');
    const contentId = id.toString();
    await Promise.all([
      collections.comments.deleteMany({ contentId }),
      collections.contentLikes.deleteMany({ contentId }),
      collections.bookmarks.deleteMany({ contentId }),
    ]);
    res.json({ message: 'Idea deleted.' });
  })
);

app.get(
  `${api}/feed`,
  requireAuth,
  handleAsync(async (req, res) => {
    const followedIds = (await collections.follows.find({ followerId: req.session.userId }).toArray()).map(
      (follow) => follow.followedId
    );
    if (!followedIds.length) return res.json([]);
    const items = await collections.contents
      .find({ creatorId: { $in: followedIds } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(await Promise.all(items.map((item) => safeContent(item, req.session.userId))));
  })
);

// Recommendations rank new people and ideas against the signed-in user's interests.
app.get(
  `${api}/recommendations`,
  requireAuth,
  handleAsync(async (req, res) => {
    const user = await userById(req.session.userId);
    if (!user) return sendError(res, 404, 'User not found.');

    const [following, sentRequests, receivedRequests] = await Promise.all([
      collections.follows.find({ followerId: user.id }).project({ followedId: 1 }).toArray(),
      collections.followRequests
        .find({ senderId: user.id, status: 'pending' })
        .project({ recipientId: 1 })
        .toArray(),
      collections.followRequests
        .find({ recipientId: user.id, status: 'pending' })
        .project({ senderId: 1 })
        .toArray(),
    ]);
    const excludedPeople = new Set([
      user.id,
      ...following.map((item) => item.followedId),
      ...sentRequests.map((item) => item.recipientId),
      ...receivedRequests.map((item) => item.senderId),
    ]);
    const terms = [
      ...new Set(
        [...(user.interests || []), ...(user.role || '').split(/[,;/]+/)]
          .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
          .filter((value) => value.length > 2)
      ),
    ];

    const candidates = await collections.users
      .find({ id: { $nin: [...excludedPeople] } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const people = candidates
      .map((candidate) => {
        const text =
          `${(candidate.interests || []).join(' ')} ${candidate.role || ''} ${candidate.bio || ''}`.toLowerCase();
        const matches = terms.filter((term) => text.includes(term));
        return {
          user: candidate,
          score: matches.length,
          reason: matches.length
            ? `Shares your interest in ${matches.slice(0, 2).join(' and ')}`
            : 'A new member of the community',
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || new Date(right.user.createdAt) - new Date(left.user.createdAt)
      )
      .slice(0, 6);

    const excludedCreators = [...new Set([user.id, ...following.map((item) => item.followedId)])];
    const ideas = await collections.contents
      .find({ creatorId: { $nin: excludedCreators } })
      .sort({ createdAt: -1 })
      .limit(150)
      .toArray();
    const rankedIdeas = ideas
      .map((idea) => {
        const text =
          `${idea.title} ${idea.description} ${idea.problem || ''} ${idea.solution || ''} ${idea.category || ''}`.toLowerCase();
        const matches = terms.filter((term) => text.includes(term));
        return {
          idea,
          score: matches.length,
          reason: matches.length
            ? `Related to your interest in ${matches.slice(0, 2).join(' and ')}`
            : 'A fresh idea from the community',
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || new Date(right.idea.createdAt) - new Date(left.idea.createdAt)
      )
      .slice(0, 6);

    res.json({
      people: await Promise.all(
        people.map(async (item) => ({
          ...(await profileFor(item.user, user.id)),
          recommendationReason: item.reason,
        }))
      ),
      ideas: await Promise.all(
        rankedIdeas.map(async (item) => ({
          ...(await safeContent(item.idea, user.id)),
          recommendationReason: item.reason,
        }))
      ),
    });
  })
);

// Following and private-account requests also create the corresponding notifications.
app.post(
  `${api}/follow`,
  requireAuth,
  handleAsync(async (req, res) => {
    const followedId = cleanString(req.body?.userId, 100);
    if (!isId(followedId) || followedId === req.session.userId)
      return sendError(res, 400, 'Choose another valid user.');
    const target = await userById(followedId);
    if (!target) return sendError(res, 404, 'User not found.');
    if (target.private) {
      if (await followRecord(req.session.userId, followedId)) return res.json({ status: 'following' });
      const existing = await collections.followRequests.findOne({
        senderId: req.session.userId,
        recipientId: followedId,
        status: 'pending',
      });
      if (existing) return res.json({ status: 'pending', requestId: existing._id.toString() });
      const request = await collections.followRequests.insertOne({
        senderId: req.session.userId,
        recipientId: followedId,
        status: 'pending',
        createdAt: new Date(),
      });
      await createNotification(
        followedId,
        req.session.userId,
        'follow_request',
        request.insertedId.toString(),
        'sent you a follow request'
      );
      return res.status(201).json({ status: 'pending', requestId: request.insertedId.toString() });
    }
    await createFollow(req.session.userId, followedId);
    res.json({ status: 'following', counts: await countsFor(followedId) });
  })
);

app.delete(
  `${api}/follow`,
  requireAuth,
  handleAsync(async (req, res) => {
    const followedId = cleanString(req.body?.userId, 100);
    if (!isId(followedId) || followedId === req.session.userId)
      return sendError(res, 400, 'Choose another valid user.');
    if (!(await userById(followedId))) return sendError(res, 404, 'User not found.');
    await collections.follows.deleteOne({ followerId: req.session.userId, followedId });
    res.json({ status: 'unfollowed', counts: await countsFor(followedId) });
  })
);

app.post(
  `${api}/follow-requests`,
  requireAuth,
  handleAsync(async (req, res) => {
    const recipientId = cleanString(req.body?.userId, 100);
    if (!isId(recipientId) || recipientId === req.session.userId)
      return sendError(res, 400, 'Choose another valid user.');
    const recipient = await userById(recipientId);
    if (!recipient) return sendError(res, 404, 'User not found.');
    if (!recipient.private) {
      await createFollow(req.session.userId, recipientId);
      return res.json({ status: 'following' });
    }
    if (await followRecord(req.session.userId, recipientId))
      return sendError(res, 409, 'You already follow this user.');
    const existing = await collections.followRequests.findOne({
      senderId: req.session.userId,
      recipientId,
      status: 'pending',
    });
    if (existing) return sendError(res, 409, 'A request is already pending.');
    const result = await collections.followRequests.insertOne({
      senderId: req.session.userId,
      recipientId,
      status: 'pending',
      createdAt: new Date(),
    });
    await createNotification(
      recipientId,
      req.session.userId,
      'follow_request',
      result.insertedId.toString(),
      'sent you a follow request'
    );
    res.status(201).json({ id: result.insertedId.toString(), status: 'pending' });
  })
);

app.get(
  `${api}/follow-requests/received`,
  requireAuth,
  handleAsync(async (req, res) => {
    const requests = await collections.followRequests
      .find({
        recipientId: req.session.userId,
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      await Promise.all(
        requests.map(async (request) => ({
          id: request._id.toString(),
          createdAt: request.createdAt,
          sender: await profileFor(await userById(request.senderId), req.session.userId),
        }))
      )
    );
  })
);

app.get(
  `${api}/follow-requests/sent`,
  requireAuth,
  handleAsync(async (req, res) => {
    const requests = await collections.followRequests
      .find({
        senderId: req.session.userId,
        status: 'pending',
      })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      await Promise.all(
        requests.map(async (request) => ({
          id: request._id.toString(),
          createdAt: request.createdAt,
          recipient: await profileFor(await userById(request.recipientId), req.session.userId),
        }))
      )
    );
  })
);

const respondToRequest = (status) =>
  handleAsync(async (req, res) => {
    const id = objectId(req.params.requestId);
    if (!id) return sendError(res, 400, 'Invalid request ID.');
    const request = await collections.followRequests.findOne({
      _id: id,
      recipientId: req.session.userId,
      status: 'pending',
    });
    if (!request) return sendError(res, 404, 'Pending request not found.');
    const updated = await collections.followRequests.updateOne(
      { _id: id, status: 'pending' },
      {
        $set: { status, respondedAt: new Date() },
      }
    );
    if (!updated.modifiedCount) return sendError(res, 409, 'This follow request has already been handled.');
    if (status === 'accepted') {
      await createFollow(request.senderId, request.recipientId);
      await createNotification(
        request.senderId,
        request.recipientId,
        'request_accepted',
        id.toString(),
        'accepted your follow request'
      );
    }
    res.json({ status, counts: await countsFor(request.recipientId) });
  });

app.post(`${api}/follow-requests/:requestId/accept`, requireAuth, respondToRequest('accepted'));
app.post(`${api}/follow-requests/:requestId/decline`, requireAuth, respondToRequest('declined'));

app.delete(
  `${api}/follow-requests/:requestId`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.requestId);
    if (!id) return sendError(res, 400, 'Invalid request ID.');
    const result = await collections.followRequests.deleteOne({
      _id: id,
      senderId: req.session.userId,
      status: 'pending',
    });
    if (!result.deletedCount) return sendError(res, 404, 'Pending request not found.');
    res.json({ message: 'Follow request cancelled.' });
  })
);

app.get(
  `${api}/users/:userId/followers`,
  handleAsync(async (req, res) => {
    const follows = await collections.follows.find({ followedId: req.params.userId }).toArray();
    res.json(
      await Promise.all(
        follows.map(async ({ followerId }) =>
          profileFor(await userById(followerId), req.session.userId || null)
        )
      )
    );
  })
);

app.get(
  `${api}/users/:userId/following`,
  handleAsync(async (req, res) => {
    const follows = await collections.follows.find({ followerId: req.params.userId }).toArray();
    res.json(
      await Promise.all(
        follows.map(async ({ followedId }) =>
          profileFor(await userById(followedId), req.session.userId || null)
        )
      )
    );
  })
);

// Notifications are scoped to the current session user.
app.get(
  `${api}/notifications`,
  requireAuth,
  handleAsync(async (req, res) => {
    const notifications = await collections.notifications
      .find({ recipientId: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(40)
      .toArray();
    res.json(
      await Promise.all(
        notifications.map(async (notification) => ({
          id: notification._id.toString(),
          type: notification.type,
          message: notification.message,
          relatedId: notification.relatedId,
          read: notification.read,
          createdAt: notification.createdAt,
          sender: await profileFor(await userById(notification.senderId), req.session.userId),
        }))
      )
    );
  })
);

app.patch(
  `${api}/notifications/:notificationId/read`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.notificationId);
    if (!id) return sendError(res, 400, 'Invalid notification ID.');
    const result = await collections.notifications.updateOne(
      {
        _id: id,
        recipientId: req.session.userId,
      },
      { $set: { read: true } }
    );
    if (!result.matchedCount) return sendError(res, 404, 'Notification not found.');
    res.json({ message: 'Notification marked as read.' });
  })
);

// Likes, comments, and bookmarks persist engagement counts and notify idea owners.
app.post(
  `${api}/contents/:contentId/like`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const contentId = id.toString();
    const content = await collections.contents.findOne({ _id: id });
    if (!content) return sendError(res, 404, 'Idea not found.');
    const result = await collections.contentLikes.updateOne(
      { contentId, userId: req.session.userId },
      {
        $setOnInsert: { contentId, userId: req.session.userId, createdAt: new Date() },
      },
      { upsert: true }
    );
    if (result.upsertedCount && content.creatorId !== req.session.userId) {
      await createNotification(content.creatorId, req.session.userId, 'like', contentId, 'liked your idea');
    }
    res.json({ liked: true, likes: await collections.contentLikes.countDocuments({ contentId }) });
  })
);

app.delete(
  `${api}/contents/:contentId/like`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const contentId = id.toString();
    await collections.contentLikes.deleteOne({ contentId, userId: req.session.userId });
    res.json({ liked: false, likes: await collections.contentLikes.countDocuments({ contentId }) });
  })
);

app.get(
  `${api}/contents/:contentId/comments`,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const comments = await collections.comments
      .find({ contentId: id.toString() })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();
    res.json(
      await Promise.all(
        comments.map(async (comment) => ({
          id: comment._id.toString(),
          text: comment.text,
          createdAt: comment.createdAt,
          user: await profileFor(await userById(comment.userId), req.session.userId || null),
        }))
      )
    );
  })
);

app.post(
  `${api}/contents/:contentId/comments`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    const text = cleanString(req.body?.text, 1000);
    if (!id || !text) return sendError(res, 400, 'A valid idea and comment are required.');
    const content = await collections.contents.findOne({ _id: id });
    if (!content) return sendError(res, 404, 'Idea not found.');
    const comment = {
      contentId: id.toString(),
      userId: req.session.userId,
      text,
      createdAt: new Date(),
    };
    const result = await collections.comments.insertOne(comment);
    if (content.creatorId !== req.session.userId) {
      await createNotification(
        content.creatorId,
        req.session.userId,
        'comment',
        id.toString(),
        'commented on your idea'
      );
    }
    res.status(201).json({
      id: result.insertedId.toString(),
      text,
      createdAt: comment.createdAt,
      user: await profileFor(await userById(req.session.userId), req.session.userId),
    });
  })
);

app.post(
  `${api}/contents/:contentId/bookmark`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const contentId = id.toString();
    const content = await collections.contents.findOne({ _id: id });
    if (!content) return sendError(res, 404, 'Idea not found.');
    const result = await collections.bookmarks.updateOne(
      { userId: req.session.userId, contentId },
      {
        $setOnInsert: { userId: req.session.userId, contentId, createdAt: new Date() },
      },
      { upsert: true }
    );
    if (result.upsertedCount && content.creatorId !== req.session.userId) {
      await createNotification(content.creatorId, req.session.userId, 'save', contentId, 'saved your idea');
    }
    res.json({
      bookmarked: true,
      saves: await collections.bookmarks.countDocuments({ contentId }),
    });
  })
);

app.delete(
  `${api}/contents/:contentId/bookmark`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.contentId);
    if (!id) return sendError(res, 400, 'Invalid content ID.');
    const contentId = id.toString();
    await collections.bookmarks.deleteOne({ userId: req.session.userId, contentId });
    res.json({
      bookmarked: false,
      saves: await collections.bookmarks.countDocuments({ contentId }),
    });
  })
);

// Uploads are stored under validated media folders using server-generated filenames.
app.post(
  `${api}/uploads`,
  requireAuth,
  handleAsync(async (req, res) => {
    const file = req.files?.file;
    const folder = cleanString(req.body?.folder, 30);
    const allowedFolders = ['profiles', 'ideas', 'documents'];
    if (!file || !allowedFolders.includes(folder))
      return sendError(res, 400, 'Choose a file and valid upload type.');
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (!allowedTypes.has(file.mimetype))
      return sendError(res, 415, 'Use a JPEG, PNG, WebP image or PDF file.');
    if (folder !== 'documents' && file.mimetype === 'application/pdf')
      return sendError(res, 415, 'This upload type only accepts images.');
    const safeExtension = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    }[file.mimetype];
    const filename = `${uuid()}${safeExtension}`;
    const directory = path.join(uploadRoot, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), file.data, { flag: 'wx' });
    const url = `/uploads/${folder}/${filename}`;
    if (folder === 'profiles')
      await collections.users.updateOne({ id: req.session.userId }, { $set: { profilePicture: url } });
    res.status(201).json({ url, filename });
  })
);
app.use('/uploads', express.static(uploadRoot));

// Conversations and messages are accessible only to their listed participants.
app.get(
  `${api}/conversations`,
  requireAuth,
  handleAsync(async (req, res) => {
    const conversations = await collections.conversations
      .find({
        participants: req.session.userId,
      })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(
      await Promise.all(
        conversations.map(async (conversation) => {
          const otherId = conversation.participants.find((id) => id !== req.session.userId);
          const [other, unread] = await Promise.all([
            profileFor(await userById(otherId), req.session.userId),
            collections.messages.countDocuments({
              conversationId: conversation.id,
              receiverId: req.session.userId,
              read: false,
            }),
          ]);
          return {
            id: conversation.id,
            other,
            unread,
            updatedAt: conversation.updatedAt,
            lastMessage: conversation.lastMessage || '',
          };
        })
      )
    );
  })
);

app.post(
  `${api}/conversations`,
  requireAuth,
  handleAsync(async (req, res) => {
    const otherId = cleanString(req.body?.userId, 100);
    if (!isId(otherId) || otherId === req.session.userId || !(await userById(otherId))) {
      return sendError(res, 400, 'Choose a valid user to message.');
    }
    const participants = [req.session.userId, otherId].sort();
    const pairKey = participants.join(':');
    let conversation = await collections.conversations.findOne({ pairKey });
    if (!conversation) {
      conversation = {
        id: uuid(),
        participants,
        pairKey,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: '',
      };
      try {
        await collections.conversations.insertOne(conversation);
      } catch (error) {
        if (error.code !== 11000) throw error;
        conversation = await collections.conversations.findOne({ pairKey });
      }
    }
    res.status(200).json({ id: conversation.id });
  })
);

app.get(
  `${api}/conversations/:conversationId/messages`,
  requireAuth,
  handleAsync(async (req, res) => {
    const conversation = await collections.conversations.findOne({
      id: req.params.conversationId,
      participants: req.session.userId,
    });
    if (!conversation) return sendError(res, 404, 'Conversation not found.');
    const messages = await collections.messages
      .find({ conversationId: conversation.id })
      .sort({ createdAt: 1 })
      .limit(300)
      .toArray();
    await collections.messages.updateMany(
      {
        conversationId: conversation.id,
        receiverId: req.session.userId,
        read: false,
      },
      { $set: { read: true } }
    );
    res.json(messages.map(({ _id, ...message }) => ({ id: _id.toString(), ...message })));
  })
);

app.post(
  `${api}/conversations/:conversationId/messages`,
  requireAuth,
  handleAsync(async (req, res) => {
    const conversation = await collections.conversations.findOne({
      id: req.params.conversationId,
      participants: req.session.userId,
    });
    const text = cleanString(req.body?.text, 2000);
    if (!conversation) return sendError(res, 404, 'Conversation not found.');
    if (!text) return sendError(res, 400, 'Message cannot be empty.');
    const receiverId = conversation.participants.find((id) => id !== req.session.userId);
    const message = {
      conversationId: conversation.id,
      senderId: req.session.userId,
      receiverId,
      text,
      createdAt: new Date(),
      read: false,
    };
    const result = await collections.messages.insertOne(message);
    await collections.conversations.updateOne(
      { id: conversation.id },
      {
        $set: { updatedAt: message.createdAt, lastMessage: text.slice(0, 120) },
      }
    );
    await createNotification(
      receiverId,
      req.session.userId,
      'message',
      conversation.id,
      'sent you a message'
    );
    res.status(201).json({ id: result.insertedId.toString(), ...message });
  })
);

// Funding opportunities are public to browse; creating or connecting requires a session.
app.get(
  `${api}/funding`,
  handleAsync(async (req, res) => {
    const items = await collections.fundingRequests
      .find({ status: 'open' })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(
      await Promise.all(
        items.map(async (item) => ({
          id: item._id.toString(),
          amount: item.amount,
          purpose: item.purpose,
          stage: item.stage,
          description: item.description,
          partnersWanted: item.partnersWanted,
          createdAt: item.createdAt,
          founder: await profileFor(await userById(item.founderId), req.session.userId || null),
        }))
      )
    );
  })
);

app.post(
  `${api}/funding`,
  requireAuth,
  handleAsync(async (req, res) => {
    const amount = cleanString(req.body?.amount, 100);
    const purpose = cleanString(req.body?.purpose, 1000);
    const description = cleanString(req.body?.description, 3000);
    if (!amount || !purpose || !description)
      return sendError(res, 400, 'Amount, purpose and business description are required.');
    const fundingRequest = {
      founderId: req.session.userId,
      amount,
      purpose,
      description,
      stage: cleanString(req.body?.stage, 80) || 'Idea',
      partnersWanted: Boolean(req.body?.partnersWanted),
      status: 'open',
      createdAt: new Date(),
    };
    const result = await collections.fundingRequests.insertOne(fundingRequest);
    res.status(201).json({ id: result.insertedId.toString(), ...fundingRequest });
  })
);

app.post(
  `${api}/funding/:fundingId/connect`,
  requireAuth,
  handleAsync(async (req, res) => {
    const id = objectId(req.params.fundingId);
    if (!id) return sendError(res, 400, 'Invalid opportunity ID.');
    const opportunity = await collections.fundingRequests.findOne({ _id: id, status: 'open' });
    if (!opportunity) return sendError(res, 404, 'Opportunity not found.');
    if (opportunity.founderId === req.session.userId)
      return sendError(res, 400, 'You cannot connect to your own opportunity.');
    await createNotification(
      opportunity.founderId,
      req.session.userId,
      'funding_interest',
      id.toString(),
      'is interested in your funding opportunity'
    );
    res.json({ message: 'Your interest was sent to the founder.' });
  })
);

registerAIRoutes({ app, api, requireAuth, handleAsync, sendError, cleanString });
registerThirdPartyDataRoutes({ app, api, handleAsync, sendError, cleanString });

app.use((req, res) => sendError(res, 404, 'Endpoint not found.'));
app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : error.code === 11000 ? 409 : 500);
  if (error.code === 11000)
    return res.status(status).json({ error: 'This action conflicts with an existing record.' });
  res
    .status(status)
    .json({ error: status === 500 ? 'The server could not complete this request.' : error.message });
});

// Connect to MongoDB and create the indexes required for unique relationships and lookups.
const start = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production.');
  }
  await mongo.connect();
  db = mongo.db(process.env.MONGODB_DATABASE || 'startnew');
  collections = {
    users: db.collection('users'),
    contents: db.collection('contents'),
    follows: db.collection('follows'),
    followRequests: db.collection('followRequests'),
    notifications: db.collection('notifications'),
    contentLikes: db.collection('contentLikes'),
    comments: db.collection('comments'),
    bookmarks: db.collection('bookmarks'),
    conversations: db.collection('conversations'),
    messages: db.collection('messages'),
    fundingRequests: db.collection('fundingRequests'),
  };
  await Promise.all([
    collections.users.createIndex({ email: 1 }, { unique: true }),
    collections.users.createIndex({ username: 1 }, { unique: true }),
    collections.follows.createIndex({ followerId: 1, followedId: 1 }, { unique: true }),
    collections.followRequests.createIndex(
      { senderId: 1, recipientId: 1 },
      { unique: true, partialFilterExpression: { status: 'pending' } }
    ),
    collections.contentLikes.createIndex({ contentId: 1, userId: 1 }, { unique: true }),
    collections.bookmarks.createIndex({ userId: 1, contentId: 1 }, { unique: true }),
    collections.conversations.createIndex({ pairKey: 1 }, { unique: true }),
    collections.messages.createIndex({ conversationId: 1, createdAt: 1 }),
    collections.notifications.createIndex({ recipientId: 1, createdAt: -1 }),
  ]);
  app.listen(port, () => console.log(`Start New is running at http://localhost:${port}`));
};

start().catch((error) => {
  console.error('Could not start Start New. Check MongoDB availability and configuration.', error.message);
  process.exitCode = 1;
});
