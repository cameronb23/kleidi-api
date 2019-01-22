import jwt from 'jsonwebtoken';
import { prisma } from './generated/prisma-client';

export const getCurrentUser = async (req) => {
  const { APP_SECRET } = process.env;
  const auth = req.request.get('Authorization');
  if (auth) {
    const token = auth.replace('Bearer ', '');
    const verifiedToken = jwt.verify(token, APP_SECRET);

    if (verifiedToken.userId) {
      const user = await prisma.user({ id: verifiedToken.userId });
      return user;
    }
  }

  return null;
};
