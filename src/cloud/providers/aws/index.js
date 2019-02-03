import AWS from 'aws-sdk';
import async from 'async';
import _ from 'underscore';
import { generateTaskDefinition, generateServiceOptions } from './util';

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
 * Retrieves all clusters on the AWS cloud (up to 50)
 */
export const getTagsForObject = async (bucket, objectKey) => {
  const params = {
    Bucket: bucket,
    Key: objectKey
  };
  try {
    const res = await S3.getObjectTagging(params).promise();

    if (res != null) {
      return res.TagSet;
    }

    return null;
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

export const retrieveServiceStatus = async (service, clusterArn) => {
  const params = {
    cluster: clusterArn,
    services: [`${service.id}`]
  };

  try {
    const res = await ECS.describeServices(params).promise();

    if (res.failures.length > 0) {
      const failureMessage = `${res.failures[0].arn}---${res.failures[0].reason}`;
      throw new Error(`Error describing services: ${failureMessage}`);
    }

    if (res.services.length === 0) {
      throw new Error('Error fetching service: No service found');
    }

    const serviceResponse = res.services[0];

    const {
      status, pendingCount, runningCount, deployments
    } = serviceResponse;

    const result = {
      currentOperation: 'DEPLOYING',
      currentOperationStatus: 'Deploying new patch to instances',
      lastDeploy: null
    };

    if (status === 'DRAINING') {
      result.currentOperation = 'SHUTTING_DOWN';
      result.currentOperationStatus = 'Service is shutting down.';
    } else if (status === 'INACTIVE') {
      result.currentOperation = 'IDLE';
      result.currentOperationStatus = 'No service deployed.';
    }

    // status is ACTIVE
    if (deployments.length > 0) {
      const deploymentStatuses = _.pluck(deployments, 'status');

      if (deploymentStatuses.includes('PRIMARY')) {
        const currentDeploy = _.findWhere(deployments, { status: 'PRIMARY' });

        result.currentOperation = 'RUNNING';
        result.currentOperationStatus = 'Service is running and stable';
        if (currentDeploy) result.lastDeploy = currentDeploy.createdAt;
      } else if (deploymentStatuses.includes('ACTIVE')) {
        result.currentOperation = 'DEPLOYING';
        result.currentOperationStatus = 'Service re-deploying';
      }
    }

    if (runningCount === 0 || pendingCount > 0) {
      result.currentOperation = 'ALLOCATING';
      result.currentOperationStatus = 'Allocating servers for deployment.';
    }

    return result;
  } catch (e) {
    throw new Error(`Error retrieving updates: ${e}`);
  }
};

export const listServices = async (service, clusterArn) => {
  const params = {
    cluster: clusterArn
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

export const updateService = async (service, clusterArn) => {
  const params = {
    service: `${service.id}`,
    cluster: clusterArn,
    taskDefinition: `${service.id}`,
    forceNewDeployment: true
  };

  try {
    const res = await ECS.updateService(params).promise();

    return res;
  } catch (e) {
    throw new Error(`Error updating service: ${e}`);
  }
};

export const deployService = async (service, clusterArn) => {
  const params = generateServiceOptions(service, clusterArn);

  // const currentServices = await listServices(service);

  try {
    // if (currentServices.length > 0) {
    //   const res = await updateService(service);

    //   return res;
    // }

    let res;

    if (service.cloudResourceId) {
      // update service
      res = await updateService(service, clusterArn);
    } else {
      res = await ECS.createService(params).promise();
    }

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

export const getCustomServiceResources = (serviceId) => {
  const params = {
    Bucket: 'kleidi-services',
    Prefix: `${serviceId}/customResources`
  };

  // eslint-disable-next-line
  return new Promise(async (resolve, reject) => {
    try {
      const res = await S3.listObjectsV2(params).promise();

      const objects = res.Contents;

      const resources = [];

      async.each(objects, async (obj, callback) => {
        const objParams = {
          Bucket: 'kleidi-services',
          Key: obj.Key
        };

        try {
          const objTagging = await S3.getObjectTagging(objParams).promise();

          let type = 'RESOURCE';
          let viewPath = null;

          const typeQuery = _.findWhere(objTagging.TagSet, { Key: 'KLEIDI_TYPE' });
          const viewPathQuery = _.findWhere(objTagging.TagSet, { Key: 'KLEIDI_VIEW_PATH' });

          if (typeQuery) {
            type = typeQuery.Value;
          }

          if (viewPathQuery) {
            viewPath = viewPathQuery.Value;
          }

          resources.push({
            path: (obj.Key.split('/customResources/')[1]),
            fileName: obj.Key.substring(obj.Key.lastIndexOf('/')),
            type,
            viewPath,
            lastUpdated: obj.LastModified
          });
          return callback();
        } catch (e) {
          return callback(e);
        }
      }, (err) => {
        if (err) {
          throw err;
        }

        return resolve(resources);
      });
    } catch (e) {
      return reject(e);
    }
  });
};

export const deleteFile = async (serviceId, filePath) => {
  const params = {
    Bucket: 'kleidi-services',
    Key: `${serviceId}/customResources/${filePath}`
  };

  try {
    await S3.deleteObject(params).promise();

    return;
  } catch (e) {
    throw new Error(`Error uploading file to S3: ${e}`);
  }
};


export const uploadFile = async (serviceId, opts, fileStream) => {
  const { filePath, fileType } = opts;
  let tags = `KLEIDI_TYPE=${fileType}`;

  if (opts.viewPath) {
    tags += `&KLEIDI_VIEW_PATH=${opts.viewPath}`;
  }
  const params = {
    Bucket: `kleidi-services/${serviceId}/customResources`,
    Key: filePath,
    Body: fileStream,
    Tagging: tags
  };

  try {
    const res = await S3.upload(params).promise();

    return res.Location;
  } catch (e) {
    throw new Error(`Error uploading file to S3: ${e}`);
  }
};
