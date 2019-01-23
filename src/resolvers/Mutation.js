/* eslint-disable import/prefer-default-export */
import bcrypt from 'bcrypt-nodejs';
import async from 'async';
import jwt from 'jsonwebtoken';

const registerUser = (parent, args, context) => new Promise((resolve, reject) => {
  async.waterfall([
    async (callback) => {
      const existingUser = await context.db.query.user({ where: { email: args.email } });

      if (existingUser) {
        return callback('User with that email already exists.');
      }

      return callback(null);
    },
    // generate salt and hashed password
    (callback) => {
      bcrypt.genSalt(10, (err, salt) => {
        if (err) {
          return callback(`Error hashing password: ${err}`);
        }

        return callback(null, salt);
      });
    },
    (salt, callback) => {
      bcrypt.hash(args.password, salt, null, (err, hash) => {
        if (err) {
          return callback(`Error hashing password: ${err}`);
        }

        return callback(null, salt, hash);
      });
    },
    async (salt, hash, callback) => {
      try {
        const user = await context.db.mutation.createUser({
          data: {
            ...args,
            salt,
            password: hash,
          }
        });

        return callback(null, user);
      } catch (e) {
        return callback(`Error creating user: ${e}`);
      }
    }
  ], (err, user) => {
    if (err) {
      // generate error response
      return reject(new Error(err));
    }

    try {
      const { APP_SECRET } = process.env;
      const token = jwt.sign({ userId: user.id }, APP_SECRET);

      return resolve({
        token,
        user
      });
    } catch (e) {
      console.log('Error calling func: ', e);
      return reject(new Error('Error generating token, user was created.'));
    }
  });
});

const login = (parent, args, context) => new Promise(async (resolve, reject) => {
  let user;

  try {
    user = await context.db.query.user({ where: { email: args.email } });
  } catch (e) {
    console.error(e);
    return null;
  }

  if (!user) throw new Error('Invalid email or password');

  async.waterfall([
    (callback) => {
      bcrypt.compare(args.password, user.password, (err, isValid) => {
        if (err) {
          return callback(`Error checking password: ${err}`);
        }

        console.log('verif: ', isValid);

        if (!isValid) {
          return callback(null, false);
        }

        return callback(null, true);
      });
    },
    (wasSuccessful, callback) => {
      if (!wasSuccessful) {
        return callback(null, false);
      }

      try {
        const { APP_SECRET } = process.env;
        const token = jwt.sign({ userId: user.id }, APP_SECRET);

        return callback(null, true, token);
      } catch (err) {
        return callback(`Error tokenizing user: ${err}`);
      }
    }
  ], (err, success, token) => {
    if (err) {
      console.error(err);
      return reject(new Error('Error signing in.'));
    }

    if (!success) {
      return reject(new Error('Incorrect email or password'));
    }

    return resolve({
      token,
      user
    });
  });
});

export default {
  registerUser,
  login
};
