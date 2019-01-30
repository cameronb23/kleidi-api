/* eslint-disable import/prefer-default-export */
import bcrypt from 'bcrypt-nodejs';
import async from 'async';
import jwt from 'jsonwebtoken';
import _ from 'underscore';

import { generateVerificationToken, sendVerificationEmail } from '../accounts';

const verifyAccount = async (parent, args, context) => {
  if (context.user.activated) {
    return {
      resourceId: context.user.id,
      status: 1,
      error: 'Email is already activated'
    };
  }

  try {
    const userQuery = await context.db.query.user({
      where: {
        id: context.user.id
      }
    }, '{ activationKey }');

    if (userQuery.activationKey == null
        || args.token !== userQuery.activationKey) {
      return {
        resourceId: context.user.id,
        status: 1,
        error: 'Invalid activation key.'
      };
    }

    await context.db.mutation.updateUser({
      where: {
        id: context.user.id
      },
      data: {
        activationKey: null,
        activated: true
      }
    }, '{ id }');

    return {
      resourceId: context.user.id,
      status: 0,
      message: 'Email activated!'
    };
  } catch (e) {
    console.error(e);
    return {
      resourceId: context.user.id,
      status: 1,
      error: 'Unable to activate email at this time. Please try again later.'
    };
  }
};

const sendEmailActivation = async (parent, args, context) => {
  if (context.user.activated) {
    return {
      resourceId: null,
      status: 1,
      error: 'Email is already activated'
    };
  }

  const token = generateVerificationToken();

  try {
    await context.db.mutation.updateUser({
      where: { id: context.user.id },
      data: { activationKey: token }
    }, '{ id }');

    await sendVerificationEmail(context.user.email, token);

    return {
      resourceId: context.user.id,
      status: 0,
      message: 'Verification email sent!'
    };
  } catch (e) {
    return {
      status: 1,
      error: 'Error sending verification email. Please try again later.'
    };
  }
};

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
        }, '{ id name email roles { permissions }');

        return callback(null, user);
      } catch (e) {
        return callback(`Error creating user: ${e}`);
      }
    },
    async (user, callback) => {
      try {
        const token = generateVerificationToken();

        try {
          await context.db.mutation.updateUser({
            where: { id: user.id },
            data: { activationKey: token }
          }, '{ id }');

          await sendVerificationEmail(user.email, token);

          return callback(null, user);
        } catch (e) {
          console.error('Error sending email: ', e);
        }

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

      const userTotalPermissions = _.flatten(_.pluck(user.roles, 'permissions'));
      const isAdmin = userTotalPermissions.includes('SYSTEM_IS_ADMIN');

      return resolve({
        token,
        isAdmin,
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
    user = await context.db.query.user({ where: { email: args.email } }, '{ id name email password roles { permissions } }');
  } catch (e) {
    console.error(e);
    return null;
  }

  if (!user) throw new Error('Invalid email or password');

  return async.waterfall([
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

    const userTotalPermissions = _.flatten(_.pluck(user.roles, 'permissions'));
    const isAdmin = userTotalPermissions.includes('SYSTEM_IS_ADMIN');

    return resolve({
      token,
      isAdmin,
      user
    });
  });
});

export default {
  registerUser,
  sendEmailActivation,
  verifyAccount,
  login
};
