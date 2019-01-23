import jwt from 'jsonwebtoken';

export const getCurrentUser = async (db, req) => {
  const { APP_SECRET } = process.env;
  const auth = req.request.get('Authorization');
  if (auth) {
    const token = auth.replace('Bearer ', '');
    const verifiedToken = jwt.verify(token, APP_SECRET);

    if (verifiedToken.userId) {
      const user = await db.query.user({ where: { id: verifiedToken.userId } }, '{ id roles { permissions } }');
      return user;
    }
  }

  return null;
};
