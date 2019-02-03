import jwt from 'jsonwebtoken';

export const getCurrentUser = async (db, req) => {
  const { APP_SECRET } = process.env;
  const auth = req.request.get('Authorization');
  if (auth) {
    const token = auth.replace('Bearer ', '');
    try {
      const verifiedToken = jwt.verify(token, APP_SECRET, { maxAge: '2d' });

      if (verifiedToken.userId) {
        const user = await db.query.user({ where: { id: verifiedToken.userId } }, '{ id email activated roles { permissions } }');
        return user;
      }
    } catch (e) {
      return null;
    }
  }

  return null;
};
