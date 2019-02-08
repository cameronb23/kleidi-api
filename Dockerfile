FROM node:10.14.2-alpine

RUN apk --no-cache add pkgconfig autoconf automake libtool nasm build-base zlib-dev

# create and select app dir
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . .

RUN npm install -g -s --no-progress pm2 yarn && \
  yarn && \
  yarn cache clean

EXPOSE 80

ENTRYPOINT ["bash","/usr/src/app/startup.sh"]