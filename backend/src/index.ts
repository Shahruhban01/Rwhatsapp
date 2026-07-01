import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRouter from './routes/auth';
import profileRouter from './routes/profile';
import chatsRouter from './routes/chats';
import usersRouter from './routes/users';
import sessionsRouter from './routes/sessions';
import storiesRouter from './routes/stories';
import storageRouter from './routes/storage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/storage', storageRouter);

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
