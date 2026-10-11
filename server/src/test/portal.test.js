import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-value-for-unit-tests';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Ticket } = await import('../models/Ticket.js');
const { default: TicketMessage } = await import('../models/TicketMessage.js');
const { default: TicketHistory } = await import('../models/TicketHistory.js');

let mongo;

async function createUser({
  name,
  email,
  password = 'password123',
  role = 'CUSTOMER',
}) {
  return User.create({
    name,
    email,
    password: await bcrypt.hash(password, 4),
    role,
    isActive: true,
  });
}

async function login(email, password = 'password123') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return response;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('SupportHub portal API', () => {
  it('registers only CUSTOMER accounts even if a role is submitted', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Ada Customer',
        email: 'ada@example.com',
        password: 'password123',
        role: 'ADMIN',
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, 'CUSTOMER');

    const stored = await User.findOne({ email: 'ada@example.com' });
    assert.equal(stored.role, 'CUSTOMER');
  });

  it('logs in with a valid password and rejects an invalid password', async () => {
    const ok = await login('ada@example.com');
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal(ok.body.user.role, 'CUSTOMER');

    const bad = await login('ada@example.com', 'wrong-password');
    assert.equal(bad.status, 401);
  });

  it('rejects unauthenticated API calls with 401', async () => {
    const response = await request(app).get('/api/tickets');
    assert.equal(response.status, 401);
  });

  it('lets a customer create and list their own tickets', async () => {
    const { body } = await login('ada@example.com');
    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${body.token}`)
      .send({
        subject: 'Cannot sign in',
        description: 'Reset email never arrives',
        category: 'Login problem',
        priority: 'High',
      });

    assert.equal(created.status, 201);
    assert.match(created.body.ticket.ticketId, /^SH-\d+$/);
    assert.equal(created.body.ticket.status, 'OPEN');
    assert.equal(created.body.ticket.createdBy._id || created.body.ticket.customerId, body.user.id);

    const inDb = await Ticket.findById(created.body.ticket._id);
    assert.ok(inDb);
    assert.equal(inDb.subject, 'Cannot sign in');

    const list = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${body.token}`);

    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0]._id, created.body.ticket._id);
  });

  it('hides another customer ticket and forbids customer status updates', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Other Customer',
      email: 'other@example.com',
      password: 'password123',
    });

    const owner = await login('ada@example.com');
    const other = await login('other@example.com');
    const ticketId = (await Ticket.findOne({ customer: 'Ada Customer' }))._id.toString();

    const peek = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${other.body.token}`);
    assert.equal(peek.status, 404);

    const patch = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${owner.body.token}`)
      .send({ status: 'IN_PROGRESS' });
    assert.equal(patch.status, 403);
  });

  it('lets support work assigned tickets, records history, and blocks unauthorized access', async () => {
    const agent = await createUser({
      name: 'Sam Support',
      email: 'sam@example.com',
      role: 'SUPPORT',
    });
    const otherAgent = await createUser({
      name: 'Other Agent',
      email: 'agent2@example.com',
      role: 'SUPPORT',
    });
    const admin = await createUser({
      name: 'Ann Admin',
      email: 'ann@example.com',
      role: 'ADMIN',
    });

    const owner = await login('ada@example.com');
    const ticket = await Ticket.findOne({ customer: 'Ada Customer' });
    const agentSession = await login('sam@example.com');
    const otherSession = await login('agent2@example.com');
    const adminSession = await login('ann@example.com');

    const unassigned = await request(app)
      .get('/api/tickets?queue=unassigned')
      .set('Authorization', `Bearer ${agentSession.body.token}`);
    assert.equal(unassigned.status, 200);
    assert.equal(unassigned.body.length, 1);

    const assignedList = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${agentSession.body.token}`);
    assert.equal(assignedList.body.length, 0);

    const adminAssign = await request(app)
      .post(`/api/tickets/${ticket._id}/assign`)
      .set('Authorization', `Bearer ${adminSession.body.token}`)
      .send({ agentId: agent._id.toString() });
    assert.equal(adminAssign.status, 200);
    assert.equal(adminAssign.body.ticket.assignedAgent.id, agent._id.toString());

    const forbiddenAdmin = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${agentSession.body.token}`);
    assert.equal(forbiddenAdmin.status, 403);

    const otherPeek = await request(app)
      .get(`/api/tickets/${ticket._id}`)
      .set('Authorization', `Bearer ${otherSession.body.token}`);
    assert.equal(otherPeek.status, 403);

    const progress = await request(app)
      .patch(`/api/tickets/${ticket._id}`)
      .set('Authorization', `Bearer ${agentSession.body.token}`)
      .send({ status: 'IN_PROGRESS' });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.ticket.status, 'IN_PROGRESS');

    const reply = await request(app)
      .post(`/api/tickets/${ticket._id}/replies`)
      .set('Authorization', `Bearer ${agentSession.body.token}`)
      .send({ message: 'We are looking into this.', visibility: 'PUBLIC' });
    assert.equal(reply.status, 201);

    const note = await request(app)
      .post(`/api/tickets/${ticket._id}/replies`)
      .set('Authorization', `Bearer ${agentSession.body.token}`)
      .send({ message: 'Internal triage note', visibility: 'INTERNAL' });
    assert.equal(note.status, 201);

    const resolve = await request(app)
      .post(`/api/tickets/${ticket._id}/resolve`)
      .set('Authorization', `Bearer ${agentSession.body.token}`)
      .send({ resolutionSummary: 'Cleared the login lockout.' });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.body.ticket.status, 'RESOLVED');

    const customerView = await request(app)
      .get(`/api/tickets/${ticket._id}`)
      .set('Authorization', `Bearer ${owner.body.token}`);
    assert.equal(customerView.status, 200);
    assert.equal(customerView.body.ticket.status, 'RESOLVED');
    assert.equal(customerView.body.ticket.resolutionSummary, 'Cleared the login lockout.');
    assert.equal(
      customerView.body.messages.every((item) => item.visibility === 'PUBLIC'),
      true,
    );

    const messages = await TicketMessage.find({ ticketId: ticket._id });
    assert.ok(messages.some((item) => item.visibility === 'INTERNAL'));
    const history = await TicketHistory.find({ ticketId: ticket._id });
    assert.ok(history.some((item) => item.action === 'ASSIGNED'));
    assert.ok(history.some((item) => item.action === 'STATUS_CHANGED'));
    assert.ok(history.some((item) => item.actorId.toString() === agent._id.toString()));
  });

  it('lets an admin view system-wide metrics', async () => {
    const admin = await login('ann@example.com');
    const metrics = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${admin.body.token}`);

    assert.equal(metrics.status, 200);
    assert.ok(metrics.body.total >= 1);
    assert.equal(typeof metrics.body.open, 'number');
    assert.equal(typeof metrics.body.resolved, 'number');
  });
});
