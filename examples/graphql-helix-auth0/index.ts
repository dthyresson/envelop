/* eslint-disable no-console */
import fastify from 'fastify';
import { getGraphQLParameters, processRequest, renderGraphiQL, shouldRenderGraphiQL } from 'graphql-helix';
import { envelop, useSchema } from '@envelop/core';
import { useAuth0 } from '@envelop/auth0';
import { makeExecutableSchema } from '@graphql-tools/schema';

const schema = makeExecutableSchema({
  typeDefs: /* GraphQL */ `
    """
    Describes the authentication object as proivided by Auth0.
    """
    type AuthenticationInfo {
      """
      String that uniquely identifies an authenticated user.
      """
      sub: String!
    }

    type Query {
      """
      The authentication information of the request.
      """
      authInfo: AuthenticationInfo
    }
  `,
  resolvers: {
    Query: {
      authInfo(_source, _args, context) {
        return context.auth0;
      },
    },
  },
});

const auth0Config = {
  domain: '{account_name}.{region}.auth0.com',
  audience: 'http://localhost:3000/graphql',
  clientId: '<insert this>',
};

const getEnveloped = envelop({
  plugins: [
    useSchema(schema),
    useAuth0({
      domain: auth0Config.domain,
      audience: auth0Config.audience,
      extendContextField: 'auth0',
    }),
  ],
});

const app = fastify();

app.route({
  method: 'GET',
  url: '/',
  async handler(req, res) {
    res.header('Content-Type', 'text/html; charset=UTF-8');
    res.send(/* HTML */ `
      <!DOCTYPE html />
      <html>
        <head>
          <script src="https://cdn.auth0.com/js/auth0-spa-js/1.12/auth0-spa-js.production.js"></script>
        </head>
        <body>
          <script>
            createAuth0Client({
              domain: ${auth0Config.domain},
              client_id: ${auth0Config.clientId},
              audience: ${auth0Config.audience},
            }).then(async auth0 => {
              await auth0.loginWithPopup();
              const accessToken = await auth0.getTokenSilently();
              window.document.body.innerText = accessToken;
            });
          </script>
        </body>
      </html>
    `);
  },
});

app.route({
  method: ['GET', 'POST'],
  url: '/graphql',
  async handler(req, res) {
    const { parse, validate, contextFactory, execute, schema } = getEnveloped({ req });
    const request = {
      body: req.body,
      headers: req.headers,
      method: req.method,
      query: req.query,
    };

    if (shouldRenderGraphiQL(request)) {
      res.type('text/html');
      res.send(renderGraphiQL({}));
    } else {
      const { operationName, query, variables } = getGraphQLParameters(request);
      const result = await processRequest({
        operationName,
        query,
        variables,
        request,
        schema,
        parse,
        validate,
        execute,
        contextFactory,
      });

      if (result.type === 'RESPONSE') {
        res.status(result.status);
        res.send(result.payload);
      } else {
        // You can find a complete example with GraphQL Subscriptions and stream/defer here:
        // https://github.com/contrawork/graphql-helix/blob/master/examples/fastify/server.ts
        res.send({ errors: [{ message: 'Not Supported in this demo' }] });
      }
    }
  },
});

app.listen(3000, () => {
  console.log(`GraphQL server is running.`);
});