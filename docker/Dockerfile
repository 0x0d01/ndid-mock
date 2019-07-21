FROM node:8-alpine as build

COPY idp/package*.json /mock/idp/
COPY as/package*.json /mock/as/
COPY rp/package*.json /mock/rp/

RUN apk update && apk add --no-cache --virtual .build-deps python make g++
RUN cd /mock/idp && npm install && \
    cd /mock/as && npm install && \
    cd /mock/rp && npm install
RUN apk del .build-deps


FROM node:8-alpine

ENV TERM=xterm-256color

RUN apk update && apk add --no-cache bash openssl

WORKDIR /mock

COPY idp /mock/idp
COPY as /mock/as
COPY rp /mock/rp

COPY docker/start-node.sh /mock

COPY --from=build /mock/idp/node_modules /mock/idp/node_modules
COPY --from=build /mock/as/node_modules /mock/as/node_modules
COPY --from=build /mock/rp/node_modules /mock/rp/node_modules

ENTRYPOINT ["./start-node.sh"]
