import { createKeybotService, deployService, uploadCustomResource } from '../cloud/keybot';
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
  }, info)
};

const Mutation = {
  createKeybotService: async (parent, args, context) => {
    // create object and start initialization
    try {
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
      throw new Error('Failed to create Keybot service');
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
    const { serviceId, filePath, file } = args;

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
      const res = await uploadCustomResource(id, cloudProvider, filePath, stream);

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
