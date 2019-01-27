import AWS from 'aws-sdk';
import async from 'async';
import { generateTaskDefinition } from './util';

AWS.config.update({
  region: 'us-east-1'
});

const ECS = new AWS.ECS();
const S3 = new AWS.S3();

/**
 * Retrieves all clusters on the AWS cloud (up to 50)
 */
export const getClusters = async () => {
  try {
    const res = await ECS.listClusters({ maxResults: 50 }).promise();
    return res;
  } catch (e) {
    throw new Error('Error attempting to fetch clusters from AWS.');
  }
};


/**
 * Creates a new ECS cluster for a service
 * @param {String} serviceId the ID of the service in Kleidi DB
 * @param {String} serviceName the name of the service
 * @param {String} serviceOwnerId the owner of the service (creator)
 * @param {Object} db the database instance
 * @returns {String} The cluster ARN from AWS
 */
export const createNewCluster = async (serviceId, serviceName, serviceOwnerId) => {
  const clusterParams = {
    clusterName: `${serviceName}-${serviceId}`,
    tags: [
      {
        key: 'serviceOwnerId',
        value: serviceOwnerId
      },
      {
        key: 'serviceId',
        value: serviceId
      },
    ]
  };

  try {
    const res = await ECS.createCluster(clusterParams).promise();

    return res.cluster.clusterArn;
  } catch (e) {
    throw new Error(`Error creating cloud service: ${e}`);
  }
};

/**
 * Creates a new task definition for an ECS cluster
 * @param {String} serviceId the ID of the service in Kleidi DB
 * @param {String} serviceName the name of the service
 */
export const createTaskDefinition = async (service, serviceCredentials) => {
  const params = generateTaskDefinition(service, serviceCredentials);

  try {
    const res = await ECS.registerTaskDefinition(params).promise();

    return res.taskDefinition.taskDefinitionArn;
  } catch (e) {
    console.error(e);
    throw new Error(`Error creating task definition: ${e}`);
  }
};

export const listServices = async (service) => {
  const params = {
    cluster: service.cloudResourceId
  };

  try {
    const res = await ECS.listServices(params).promise();

    return res.serviceArns;
  } catch (e) {
    throw new Error(`Error listing services: ${e}`);
  }
};

export const deleteOtherServices = async (service) => {
  try {
    const serviceArns = await listServices(service);

    async.each(serviceArns, async (serviceArn, callback) => {
      console.log('service name: ', serviceArn.split('/')[1]);
      const params = {
        cluster: service.cloudResourceId,
        service: serviceArn.split('/')[1]
      };

      try {
        await ECS.deleteService(params);
      } catch (e) {
        callback(e);
      }
    }, (err) => {
      if (err) {
        throw err;
      }
    });
  } catch (e) {
    throw new Error(e);
  }
};

export const updateService = async (service) => {
  const params = {
    service: 'keybot-service',
    cluster: service.cloudResourceId,
    taskDefinition: `${service.name}-${service.id}`,
    forceNewDeployment: true
  };

  try {
    const res = await ECS.updateService(params).promise();

    return res.service.serviceArn;
  } catch (e) {
    throw new Error(`Error updating service: ${e}`);
  }
};

export const deployService = async (service) => {
  const params = {
    cluster: service.cloudResourceId,
    desiredCount: 1,
    serviceName: 'keybot-service',
    taskDefinition: `${service.name}-${service.id}`,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: ['subnet-0289ea1e7ab7ee6e8']
      }
    }
  };

  const currentServices = await listServices(service);

  try {
    if (currentServices.length > 0) {
      const res = await updateService(service);

      return res;
    }

    const res = await ECS.createService(params).promise();

    return res.service.serviceArn;
  } catch (e) {
    throw new Error(`Error deploying service: ${e}`);
  }
};

/**
 * Fetches all custom resource objects from S3
 * @param {String} serviceId the internal service id to fetch resources for
 */
export const getCustomResources = async (serviceId) => {
  const params = {
    Bucket: `kleidi-services/${serviceId}/customResources`
  };

  try {
    const res = await S3.listObjects(params).promise();

    return res.Contents;
  } catch (e) {
    throw new Error(`Error fetching custom resources from S3: ${e}`);
  }
};

export const uploadFile = async (serviceId, filePath, fileStream) => {
  const params = {
    Bucket: `kleidi-services/${serviceId}/customResources`,
    Key: filePath,
    Body: fileStream
  };

  try {
    const res = await S3.upload(params).promise();

    return res.Location;
  } catch (e) {
    throw new Error(`Error uploading file to S3: ${e}`);
  }
};
