export const generateTaskDefinition = (service, credentials, accessKey) => ({
  family: `keybot-${service.id}`,
  cpu: '.5 vcpu', // CPU units to be used - https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_TaskDefinition.html
  memory: '1GB', // MB
  executionRoleArn: 'arn:aws:iam::758556097563:role/Kleidi-Deploy-ECS',
  taskRoleArn: 'arn:aws:iam::758556097563:role/Kleidi-Deploy-ECS',
  networkMode: 'awsvpc',
  requiresCompatibilities: ['FARGATE'],
  containerDefinitions: [
    {
      name: 'keybot-container',
      image: '758556097563.dkr.ecr.us-east-1.amazonaws.com/kleidi/deployment:latest',
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': 'Kleidi-Custom-Deployment',
          'awslogs-region': 'us-east-1',
          'awslogs-stream-prefix': 'ecs'
        }
      },
      portMappings: [
        {
          containerPort: 80
        }
      ],
      environment: [
        {
          name: 'KEYBOT_SERVICE_ID',
          value: service.id
        },
        {
          name: 'SERVICE_ACCESS_KEY',
          value: accessKey
        },
        {
          name: 'PRODUCTION',
          value: credentials.production.toString()
        },
        {
          name: 'SESSION_SECRET',
          value: credentials.sessionSecret
        },
        {
          name: 'MONGO_URL',
          value: credentials.mongoUrl
        },
        {
          name: 'DISCORD_TOKEN',
          value: credentials.discordToken
        },
        {
          name: 'ENCRYPTION_KEY',
          value: credentials.encryptionKey
        }
      ]
    }
  ]
});

export const generateServiceOptions = (service, clusterArn) => ({
  cluster: clusterArn,
  desiredCount: 1,
  serviceName: `${service.id}`,
  taskDefinition: `keybot-${service.id}`,
  launchType: 'FARGATE',
  networkConfiguration: {
    awsvpcConfiguration: {
      assignPublicIp: 'ENABLED',
      securityGroups: ['sg-0feb401e0ae57c984'],
      subnets: ['subnet-0289ea1e7ab7ee6e8']
    }
  }
});
