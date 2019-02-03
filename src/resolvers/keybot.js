import {
  createKeybotService,
  pingServiceStatus,
  deployService,
  fetchCustomResources,
  uploadCustomResource,
  deleteCustomResource
} from '../cloud/keybot';
import { getEntitlements } from '../billing/user';
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
    const serviceRes = await context.db.query.keybotServices(query, '{ id name cloudProvider cloudResourceId }');

    if (serviceRes.length > 0) {
      const service = serviceRes[0];
      pingServiceStatus(service, context.db);
    }

    return context.db.query.keybotServices(query, info);
  },
  // eslint-disable-next-line max-len
  keybotServiceCredentials: async (parent, args, context, info) => context.db.query.keybotCredentialses({
    where: {
      forService: { id: args.serviceId, owner: { id: context.user.id } }
    }
  }, info),
  keybotCustomFiles: async (parent, args, context) => {
    const query = {
      where: {
        id: args.serviceId,
        owner: {
          id: context.user.id
        }
      }
    };
    const serviceRes = await context.db.query.keybotServices(query, '{ id }');

    if (serviceRes.length < 0) {
      return {
        status: 1,
        error: 'No service found'
      };
    }

    const serviceId = serviceRes[0].id;

    // fetch custom files
    fetchCustomResources(serviceId, context.db);

    return {
      status: 0,
      resourceId: serviceId
    };
  }
};

const Mutation = {
  createKeybotService: async (parent, args, context) => {
    // create object and start initialization
    // verify user has allowance to do so
    try {
      const userQuery = await context.db.query.user({ where: { id: context.user.id } }, '{ activated billing { subscriptions { active plan { serviceEntitlements product { forService } } } } }');

      if (userQuery == null) {
        throw new Error('user not found');
      }

      const { activated } = userQuery;

      if (!activated) {
        return {
          status: 1,
          error: 'Your account must be activated to create a service.'
        };
      }
      const serviceQuery = await context.db.query.keybotServices({
        where: {
          owner: { id: context.user.id }
        }
      }, '{ id }');

      const currentServices = serviceQuery.length;
      // check their allowances via their billing plans
      const entitlementArray = getEntitlements(userQuery, 'KEYBOT', 'maxServices');
      let allowance = 0;

      if (entitlementArray.length > 0) {
        allowance = entitlementArray.reduce((total, now) => total + now);
      }

      if (!allowance || currentServices >= allowance) {
        return {
          status: 1,
          error: 'Not enough allowance on current billing plan.'
        };
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

      return {
        resourceId: service.id,
        status: 0,
        message: 'Keybot service created successfully.'
      };
    } catch (e) {
      console.error(e);
      return {
        status: 1,
        error: 'Unknown error creating service. Please try again later.'
      };
    }
  },
  updateKeybotCredentials: async (parent, args, context, info) => {
    const { serviceId, data } = args;

    try {
      const serviceQuery = await context.db.query.keybotService({
        where: { id: serviceId }
      }, '{ id owner { id } credentials { id } }');

      if (serviceQuery == null) {
        return {
          status: 1,
          error: 'No service found'
        };
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

      decryptFields(credentials);

      return {
        status: 0,
        resourceId: credentials.id,
        message: 'Updated credentials successfully'
      };
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
        return {
          status: 1,
          error: 'No service found.'
        };
      }

      if (serviceQuery.owner.id !== context.user.id) {
        throw new Error('Unauthorized');
      }

      // found service & auth'd owner
      // fetch creds

      if (!serviceQuery.credentials) {
        return {
          status: 1,
          error: 'Please add credentials to this service before deploying.'
        };
      }

      const credentials = await context.db.query.keybotCredentials({
        where: {
          id: serviceQuery.credentials.id
        }
      }, '{ production sessionSecret mongoUrl discordToken encryptionKey }');

      if (!credentials.production
        || !credentials.sessionSecret
        || !credentials.mongoUrl
        || !credentials.discordToken
        || !credentials.encryptionKey
      ) {
        return {
          status: 1,
          error: 'Please fill in all credentials for this service before deploying.'
        };
      }

      const unlockedCredentials = decryptFields(credentials);

      // update status and deploy
      await context.db.mutation.updateKeybotService({
        where: {
          id
        },
        data: {
          currentOperation: 'DEPLOYING',
          currentOperationStatus: 'Deploying to cloud'
        }
      }, info);

      deployService(serviceQuery, unlockedCredentials, context.db);

      return {
        status: 0,
        resourceId: serviceQuery.id,
        message: 'Successfully queued deployment'
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  deleteCustomFile: async (parent, args, context) => {
    const { serviceId, filePath } = args;

    const serviceQuery = await context.db.query.keybotService({
      where: {
        id: serviceId
      }
    }, '{ id cloudProvider owner { id } }');

    if (serviceQuery == null) {
      return {
        resourceId: null,
        status: 1,
        error: 'No service found with id provided'
      };
    }

    if (serviceQuery.owner.id !== context.user.id) {
      throw new Error('Unauthorized');
    }

    try {
      await deleteCustomResource(serviceQuery.id, filePath);
      await fetchCustomResources(serviceQuery.id, context.db);

      return {
        resourceId: serviceQuery.id,
        status: 0,
        message: 'Resource successfully deleted'
      };
    } catch (e) {
      return {
        resourceId: null,
        status: 1,
        error: 'Error deleting resource. Please try again later.'
      };
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
    }, '{ id cloudProvider owner { id } }');

    if (serviceQuery == null) {
      return {
        resourceId: null,
        status: 1,
        error: 'No service found with id provided'
      };
    }

    if (serviceQuery.owner.id !== context.user.id) {
      throw new Error('Unauthorized');
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
