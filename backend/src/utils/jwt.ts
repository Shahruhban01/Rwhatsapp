import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_key';

export interface TokenPayload {
  userId: string;
  sessionId: string;
}

export function generateAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ userId, sessionId }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ userId, sessionId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}
