import _ from 'underscore';
import async from 'async';
import bcrypt from 'bcrypt-nodejs';

const Query = {};

const Mutation = {
  changePassword: async (parent, args, context) => new Promise(async (resolve, reject) => {
    let user;

    try {
      user = await context.db.query.user({ where: { id: context.user.id } }, '{ id password salt }');
    } catch (e) {
      console.error(e);
      return resolve({
        status: 1,
        error: 'Error updating password.'
      })
    }

    if (!user) return resolve({
      status: 1,
      error: 'Invalid user'
    });

    const { oldPassword, newPassword } = args;

    return async.waterfall([
      (callback) => {
        bcrypt.compare(oldPassword, user.password, (err, isValid) => {
          if (err) {
            return callback(`Error checking password: ${err}`);
          }
  
          if (!isValid) {
            return callback(null, false);
          }
  
          return callback(null, true);
        });
      },
      (wasSuccessful, callback) => {
        if (!wasSuccessful) {
          return callback(null, false, null);
        }

        // hash new password
        bcrypt.hash(args.password, user.salt, null, (err, hash) => {
          if (err) {
            return callback(err);
          }
  
          return callback(null, true, hash);
        });
      },
      async (wasSuccessful, hash, callback) => {
        if (!wasSuccessful) {
          return callback(null, false);
        }

        // update user
        try {
          await context.db.mutation.updateUser({
            where: {
              id: user.id
            },
            data: {
              password: hash
            }
          });

          return callback(null, true);
        } catch (e) {
          return callback(e);
        }
      }
    ], (err, success) => {
      if (err) {
        console.error(err);
        return resolve({
          status: 1,
          error: 'Error updating password. Please try again later.'
        });
      }
  
      if (!success) {
        return resolve({
          status: 1,
          error: 'Invalid password'
        });
      }
  
      return resolve({
        status: 0,
        message: 'Password updated successfully'
      });
    });
  })
};

export default {
  Query,
  Mutation
};