'use strict';

const camundaExtensions = require('../../../../resources/camunda');
const factory = require('../../../helpers/factory');
const nock = require('nock');
const {Engine} = require('bpmn-engine');
const {getDefinition} = require('../../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('ServiceTask', () => {
  describe('io', () => {
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

    it('returns input context if no input parameters', (done) => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="ping" name="ping" implementation="\${services.ping}">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged" value="\${true}" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;

      getDefinition(source, extensions).then((definition) => {
        definition.environment.assignVariables({
          apiPath: 'http://example-2.com',
          input: 2,
        });
        definition.environment.addService('ping', (arg, next) => {
          expect(arg).to.have.property('variables');
          next();
        });

        const task = definition.getChildActivityById('ping');
        task.once('end', (activityApi, executionContext) => {
          const output = executionContext.getOutput();
          expect(output).to.eql({
            pinged: true
          });
          done();
        });

        task.run();
      }).catch(done);
    });
  });

  describe('service', () => {
    it('resolves service from property named "service" (deprecated)', (done) => {
      const source = factory.resource('issue-7.bpmn');
      const engine = Engine({
        source,
        extensions
      });

      engine.execute({
        services: {
          myCustomService: (executionContext, serviceCallback) => {
            serviceCallback(null, 'success');
          }
        }
      });

      engine.once('end', (execution) => {
        expect(execution.getOutput().taskInput.Task_0kxsx8j).to.eql(['success']);
        done();
      });
    });
  });
});
