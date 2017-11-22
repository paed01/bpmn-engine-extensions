'use strict';

const camundaExtensions = require('../../../resources/camunda');
const factory = require('../../helpers/factory');
const nock = require('nock');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('ServiceTask IO', () => {
  it('uses input parameters', (done) => {
    nock('http://example.com')
      .defaultReplyHeaders({
        'Content-Type': 'application/json'
      })
      .get('/test')
      .reply(200, {
        data: 4
      });

    const source = factory.resource('service-task-io.bpmn').toString();
    getDefinition(source, extensions).then((definition) => {
      definition.environment.addService('getRequest', {
        module: 'request',
        fnName: 'get'
      });
      definition.environment.set('apiPath', 'http://example.com/test');

      const task = definition.getChildActivityById('serviceTask');
      task.activate();

      task.once('start', (activityApi, executionContext) => {
        expect(executionContext.getInput()).to.eql({ uri: 'http://example.com/test', json: true });
      });

      task.once('end', (activityApi, executionContext) => {
        const output = executionContext.getOutput();
        expect(Object.keys(output)).to.have.same.members(['statusCode', 'body']);
        expect(output.statusCode).to.equal(200);
        expect(output.body).to.eql({ data: 4});
        done();
      });

      task.inbound[0].take();
    }).catch(done);
  });

  it('returns mapped output', (done) => {
    const source = factory.resource('service-task-io-types.bpmn').toString();
    getDefinition(source, extensions).then((definition) => {
      definition.environment.assignVariables({
        apiPath: 'http://example-2.com',
        input: 2,
      });
      definition.environment.addService('get', (arg, next) => {
        next(null, {
          statusCode: 200,
          pathname: '/ignore'
        }, {
          data: arg.input
        });
      });

      const task = definition.getChildActivityById('serviceTask');
      task.once('end', (activityApi, executionContext) => {
        const output = executionContext.getOutput();
        expect(output).to.eql({
          statusCode: 200,
          body: {
            data: 2
          }
        });
        done();
      });

      task.run();
    }).catch(done);
  });
});
