import {
  createKeybotService,
  pingServiceStatus,
  deployService,
  uploadCustomResource
} from '../cloud/keybot';
import { encryptData, decryptData } from '../crypto';

const fieldNames = ['sessionSecret', 'mongoUrl', 'discordToken', 'encryptionKey'];

const encryptFields = (obj) => {
  const newObject = Object.assign({}, obj);

  fieldNames.map((name) => {
    if (obj[name]) newObject[name] = encryptData(obj[name]);
    return newObject;
  });

  return newObject;
};

const decryptFields = (obj) => {
  const newObject = Object.assign({}, obj);

  fieldNames.map((name) => {
    newObject[name] = decryptData(obj[name]);
    return newObject;
  });

  return newObject;
};

const Query = {
  ownedKeybotServices: async (parent, args, context, info) => context.db.query.keybotServices({
    where: {
      owner: {
        id: context.user.id
      }
    }
  }, info),
  // eslint-disable-next-line max-len
  ownedKeybotService: async (parent, args, context, info) => {
    const query = {
      where: {
        id: args.serviceId,
        owner: {
          id: context.user.id
        }
      }
    };
    const serviceRes = await context.db.query.keybotServices(query, '{ id name cloudProvider }');

    if (serviceRes.length > 0) {
      const service = serviceRes[0];
      pingServiceStatus(service, context.db);
    }

    return context.db.query.keybotServices(query, info);
  }
};

const Mutation = {
  createKeybotService: async (parent, args, context) => {
    // create object and start initialization
    // verify user has allowance to do so
    try {
      const userQuery = await context.db.query.user({ where: { id: context.user.id } }, '{ billingPlans { associatedProducts { forServices serviceRestrictions } } }');

      if (userQuery == null) {
        throw new Error('user not found');
      }

      const { billingPlans } = userQuery;

      if (billingPlans.length === 0) {
        throw new Error('Not enough allowance on current billing plan.');
      }

      const serviceQuery = await context.db.query.keybotServices({
        where: {
          owner: { id: context.user.id }
        }
      }, '{ id }');

      const currentServices = serviceQuery.length;
      // check their allowances via their billing plans
      let serviceAllowance = 0;
      billingPlans.forEach((plan) => {
        plan.associatedProducts.forEach((product) => {
          let allowance;
          if (product.forServices.includes('keybot')) {
            allowance = product.serviceRestrictions.keybotMaxServices;
          }
          serviceAllowance += allowance;
        });
      });

      if (currentServices >= serviceAllowance) {
        throw new Error('Not enough allowance on current billing plan.');
      }

      const service = await context.db.mutation.createKeybotService({
        data: {
          name: args.name,
          owner: { connect: { id: context.user.id } },
          cloudProvider: 'AWS',
          currentOperation: 'CREATING',
          currentOperationStatus: 'Creating new service stack',
          updateType: args.updateType
        }
      }, '{ id }');

      createKeybotService(service.id, args.name, context.user.id, 'AWS', context.db);

      return service;
    } catch (e) {
      throw e;
    }
  },
  updateKeybotCredentials: async (parent, args, context, info) => {
    const { serviceId, data } = args;

    try {
      const serviceQuery = await context.db.query.keybotService({
        where: { id: serviceId }
      }, '{ id owner { id } credentials { id } }');

      if (serviceQuery == null) {
        throw new Error('No service found.');
      }

      if (serviceQuery.owner.id !== context.user.id) {
        throw new Error('Unauthorized');
      }

      let credentials;
      const encrypted = encryptFields(data);

      if (serviceQuery.credentials == null) {
        // create new credentials
        credentials = await context.db.mutation.createKeybotCredentials({
          data: {
            ...encrypted,
            forService: { connect: { id: serviceQuery.id } }
          }
        }, info);
      } else {
        // update credentials
        credentials = await context.db.mutation.updateKeybotCredentials({
          where: {
            id: serviceQuery.credentials.id
          },
          data: encrypted
        }, info);
      }

      const decrypted = decryptFields(credentials);

      return decrypted;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  deployService: async (parent, args, context, info) => {
    const { id } = args;

    try {
      const serviceQuery = await context.db.query.keybotService({
        where: { id }
      }, '{ id owner { id } cloudResourceId cloudProvider name credentials { id } }');

      if (serviceQuery == null) {
        throw new Error('No service found.');
      }

      if (serviceQuery.owner.id !== context.user.id) {
        throw new Error('Unauthorized');
      }

      // found service & auth'd owner
      // fetch creds

      const credentials = await context.db.query.keybotCredentials({
        where: {
          id: serviceQuery.credentials.id
        }
      }, '{ production sessionSecret mongoUrl discordToken encryptionKey }');

      console.log(credentials);

      if (
        !credentials
        || (!credentials.production
          || !credentials.sessionSecret
          || !credentials.mongoUrl
          || !credentials.discordToken
          || !credentials.encryptionKey
        )
      ) {
        throw new Error('No credentials or non-complete credentials');
      }

      console.log('creds: ', credentials);

      const unlockedCredentials = decryptFields(credentials);

      // update status and deploy
      const res = await context.db.mutation.updateKeybotService({
        where: {
          id
        },
        data: {
          currentOperation: 'DEPLOYING',
          currentOperationStatus: 'Deploying to cloud'
        }
      }, info);

      deployService(serviceQuery, unlockedCredentials, context.db);

      return res;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  uploadCustomFile: async (parent, args, context) => {
    const {
      serviceId,
      filePath,
      file,
      fileType
    } = args;

    const serviceQuery = await context.db.query.keybotService({
      where: {
        id: serviceId
      }
    }, '{ id cloudProvider }');

    if (serviceQuery == null) {
      return {
        resourceId: null,
        status: 1,
        error: 'No service found with id provided'
      };
    }

    const { id, cloudProvider } = serviceQuery;

    const { createReadStream } = await file;

    const stream = createReadStream();

    try {
      const opts = {
        filePath,
        fileType
      };

      if (args.viewPath) {
        opts.viewPath = args.viewPath;
      }

      const res = await uploadCustomResource(id, cloudProvider, opts, stream);

      return {
        resourceId: res,
        status: 0,
        message: 'File uploaded successfully'
      };
    } catch (e) {
      return {
        resourceId: null,
        status: 1,
        error: 'Error uploading file. Please try again later.'
      };
    }
  }
};

export default {
  Query,
  Mutation
};
