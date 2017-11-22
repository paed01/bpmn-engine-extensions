'use strict';

const camundaExtensions = require('../../../resources/camunda');
const factory = require('../../helpers/factory');
const nock = require('nock');
const request = require('request');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('Connector', () => {
  describe('input/output', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="sendEmail_1" name="send mail">
            <extensionElements>
              <camunda:connector>
                <camunda:inputOutput>
                  <camunda:inputParameter name="to" />
                  <camunda:inputParameter name="subject">Resolved \${ticketId}</camunda:inputParameter>
                  <camunda:inputParameter name="message">
                    <camunda:list>
                      <camunda:value>Your ticket \${ticketId} was resolved.</camunda:value>
                      <camunda:value>Best regards,</camunda:value>
                      <camunda:value>\${supportEmail}</camunda:value>
                    </camunda:list>
                  </camunda:inputParameter>
                </camunda:inputOutput>
                <camunda:connectorId>sendEmail</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:inputParameter name="to" value="\${variables.emailAddress}" />
                <camunda:inputParameter name="ticketId" value="987654" />
                <camunda:inputParameter name="supportEmail" value="support@example.com" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
          <serviceTask id="sendEmail_2" name="send mail">
            <extensionElements>
              <camunda:connector>
                <camunda:connectorId>sendEmail</camunda:connectorId>
              </camunda:connector>
            </extensionElements>
          </serviceTask>
          <serviceTask id="ping" name="ping">
            <extensionElements>
              <camunda:connector>
                <camunda:inputOutput>
                  <camunda:outputParameter name="pinged" value="\${true}" />
                </camunda:inputOutput>
                <camunda:connectorId>ping</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged" value="\${pinged}" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;
      context = await getDefinition(source, extensions);
    });

    describe('input', () => {
      it('calls service with connector input as arguments', (done) => {
        context.environment.addService('sendEmail', (to, subject, message) => {
          expect(to).to.equal('to@example.com');
          expect(subject).to.equal('Resolved 987654');
          expect(message).to.eql(['Your ticket 987654 was resolved.', 'Best regards,', 'support@example.com']);
          done();
        });
        context.environment.set('emailAddress', 'to@example.com');

        const task = context.getChildActivityById('sendEmail_1');
        task.run();
      });

      it('unresolved arguments are passed as undefined', (done) => {
        context.environment.addService('sendEmail', (to, subject, message) => {
          expect(to).to.equal(undefined);
          expect(subject).to.equal('Resolved 987654');
          expect(message).to.eql(['Your ticket 987654 was resolved.', 'Best regards,', 'support@example.com']);
          done();
        });

        const task = context.getChildActivityById('sendEmail_1');
        task.run();
      });

      it('service is called with activity input context if without connector input', (done) => {
        context.environment.addService('sendEmail', (inputContext) => {
          expect(inputContext.variables).to.eql({
            ticketId: '987654'
          });
          done();
        });
        context.environment.set('ticketId', '987654');

        const task = context.getChildActivityById('sendEmail_2');
        task.run();
      });
    });

    describe('output', () => {
      it('resolves activity output from connector output', (done) => {
        context.environment.addService('ping', (c, next) => {
          next(null, true);
        });
        const task = context.getChildActivityById('ping');

        task.once('end', (activityApi, executionContext) => {
          expect(executionContext.getOutput()).to.eql({
            pinged: true
          });
          done();
        });

        task.run();
      });
    });
  });

  describe('Camunda connector is defined with input/output', () => {
    let definition;
    before(async () => {
      const source = factory.resource('issue-4.bpmn').toString();
      definition = await getDefinition(source, extensions);
      definition.environment.addService('send-email', (emailAddress, callback) => {
        callback(null, 'success');
      });
      definition.environment.set('emailAddress', 'lisa@example.com');
    });

    it('service task has io', (done) => {
      const task = definition.getChildActivityById('sendEmail_1');
      expect(task.io, 'task IO').to.be.ok;
      done();
    });

    it('executes connector-id service', (done) => {
      const task = definition.getChildActivityById('sendEmail_1');
      task.once('end', (activityApi, executionContext) => {
        const output = executionContext.getOutput();
        expect(output).to.eql({
          messageId: 'success',
        });
        done();
      });

      task.run();
    });

    it('executes service using defined input', (done) => {
      const task = definition.getChildActivityById('sendEmail_1');
      let input, inputArg;

      definition.environment.addService('send-email', (emailAddress, callback) => {
        inputArg = emailAddress;
        callback(null, 'success');
      });

      task.once('start', (activityApi, executionContext) => {
        input = executionContext.getInput();
      });

      task.once('end', (activityApi, executionContext) => {
        const output = executionContext.getOutput();
        expect(input).to.eql({
          emailAddress: 'lisa@example.com'
        });
        expect(inputArg).to.equal('lisa@example.com');
        expect(output).to.eql({
          messageId: 'success',
        });
        done();
      });

      task.run();
    });

    it('returns defined output', (done) => {
      const task = definition.getChildActivityById('sendEmail_1');

      definition.environment.addService('send-email', (emailAddress, callback) => {
        callback(null, 10);
      });

      task.once('end', (activityApi, executionContext) => {
        const output = executionContext.getOutput();
        expect(output).to.eql({
          messageId: 10,
        });
        done();
      });

      task.run();
    });
  });

  describe('misc', () => {
    it('service expects input options', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Call api">
            <extensionElements>
              <camunda:connector>
                <camunda:connectorId>get</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:inputParameter name="uri">\${variables.api}/v1/data</camunda:inputParameter>
                <camunda:inputParameter name="json">\${true}</camunda:inputParameter>
                <camunda:inputParameter name="headers">
                  <camunda:map>
                    <camunda:entry key="User-Agent">curl</camunda:entry>
                    <camunda:entry key="Accept">application/json</camunda:entry>
                  </camunda:map>
                </camunda:inputParameter>
                <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
                <camunda:outputParameter name="body">\${result[1]}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;

      nock('http://example.com', {
        reqheaders: {
          'User-Agent': 'curl',
          Accept: 'application/json'
        }})
        .defaultReplyHeaders({
          'Content-Type': 'application/json'
        })
        .get('/v1/data')
        .reply(200, {
          data: 4
        });

      getDefinition(source, extensions).then((definition) => {
        definition.environment.addService('get', {
          module: 'request',
          fnName: 'get'
        });
        definition.environment.assignVariables({
          api: 'http://example.com'
        });

        const task = definition.getChildActivityById('serviceTask');

        task.once('end', (activityApi, executionContext) => {
          const output = executionContext.getOutput();
          expect(output).to.eql({
            statusCode: 200,
            body: {data: 4}
          });
          done();
        });

        task.run();
      });
    });

    it('service function address other service function', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Call api">
            <extensionElements>
              <camunda:connector>
                <camunda:connectorId>myFunc</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:inputParameter name="variables">\${variables}</camunda:inputParameter>
                <camunda:inputParameter name="services">\${services}</camunda:inputParameter>
                <camunda:outputParameter name="message">\${result[0]}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;

      getDefinition(source, extensions).then((definition) => {
        definition.environment.addService('appendPath', (uri) => {
          return `${uri}/v3/data`;
        });
        definition.environment.addService('myFunc', (message, callback) => {
          const apiWithPath = message.services.appendPath(message.variables.api);
          callback(null, `successfully executed with ${apiWithPath}`);
        });
        definition.environment.assignVariables({
          api: 'http://example.com'
        });

        const task = definition.getChildActivityById('serviceTask');

        task.once('end', (activityApi, executionContext) => {
          const output = executionContext.getOutput();
          expect(output).to.eql({
            message: 'successfully executed with http://example.com/v3/data'
          });
          done();
        });

        task.run();
      });
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let definition;
      beforeEach(async () => {
        definition = await getLoopDefinition(true);
      });

      it('emits start with task id', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(50)
          .reply(200, {})
          .get('/api/franz?version=1')
          .delay(30)
          .reply(200, {})
          .get('/api/immanuel?version=2')
          .reply(409, {});

        const starts = [];
        task.on('start', (activity) => {
          starts.push(activity.id);
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(starts).to.eql(['task', 'task', 'task']);
          done();
        });

        task.run();
      });

      it('emits end when completed', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        task.on('start', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          nock('http://example.com')
            .get(`/api${input.path}?version=${input.version}`)
            .reply(input.version < 2 ? 200 : 409, {});
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;
          done();
        });

        task.run();
      });

      it('getOutput() returns result from loop', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        task.on('start', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          nock('http://example.com')
            .get(`/api${input.path}?version=${input.version}`)
            .delay(50 - input.version * 10)
            .reply(input.version < 2 ? 200 : 409, {
              idx: input.version
            });
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(executionContext.getOutput().loopResult).to.eql([{
            statusCode: 200,
            body: {
              idx: 0
            }
          }, {
            statusCode: 200,
            body: {
              idx: 1
            }
          }, {
            statusCode: 409,
            body: {
              idx: 2
            }
          }]);
          done();
        });

        task.run();
      });

    });

    describe('parallell', () => {
      let definition;
      beforeEach(async () => {
        definition = await getLoopDefinition(false);
      });

      it('emits start with different ids', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(20)
          .reply(200, {})
          .get('/api/franz?version=1')
          .delay(10)
          .reply(200, {})
          .get('/api/immanuel?version=2')
          .reply(409, {});

        const starts = [];
        task.on('start', (activityApi, executionContext) => {
          starts.push(executionContext.id);
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(starts.includes(task.id), 'unique task id').to.not.be.ok;
          done();
        });

        task.run();
      });

      it('returns output in sequence', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        task.on('start', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          nock('http://example.com')
            .get(`/api${input.path}?version=${input.version}`)
            .delay(50 - input.version * 10)
            .reply(input.version < 2 ? 200 : 409, {
              idx: input.version
            });
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(executionContext.getOutput().loopResult).to.eql([{
            statusCode: 200,
            body: {
              idx: 0
            }
          }, {
            statusCode: 200,
            body: {
              idx: 1
            }
          }, {
            statusCode: 409,
            body: {
              idx: 2
            }
          }]);
          done();
        });

        task.run();
      });

      it('getOutput() returns result from loop', (done) => {
        const task = definition.getChildActivityById('task');
        task.activate();

        task.on('start', (activityApi, executionContext) => {
          const input = executionContext.getInput();
          nock('http://example.com')
            .get(`/api${input.path}?version=${input.version}`)
            .delay(50 - input.version * 10)
            .reply(input.version < 2 ? 200 : 409, {
              idx: input.version
            });
        });

        task.on('end', (activityApi, executionContext) => {
          if (executionContext.isLoopContext) return;

          expect(executionContext.getOutput().loopResult).to.eql([{
            statusCode: 200,
            body: {
              idx: 0
            }
          }, {
            statusCode: 200,
            body: {
              idx: 1
            }
          }, {
            statusCode: 409,
            body: {
              idx: 2
            }
          }]);
          done();
        });

        task.run();
      });
    });
  });

});

async function getLoopDefinition(isSequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
    <process id="parallellLoopProcess" isExecutable="true">
      <serviceTask id="task">
        <multiInstanceLoopCharacteristics isSequential="${isSequential}" camunda:collection="\${variables.paths}">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:inputParameter name="version">\${index}</camunda:inputParameter>
            <camunda:inputParameter name="path">\${item}</camunda:inputParameter>
            <camunda:outputParameter name="loopResult">\${result}</camunda:outputParameter>
          </camunda:inputOutput>
          <camunda:connector>
            <camunda:inputOutput>
              <camunda:inputParameter name="reqOptions">
                <camunda:map>
                  <camunda:entry key="uri">http://example.com/api\${path}?version=\${version}</camunda:entry>
                  <camunda:entry key="json">\${true}</camunda:entry>
                </camunda:map>
              </camunda:inputParameter>
              <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
              <camunda:outputParameter name="body" />
            </camunda:inputOutput>
            <camunda:connectorId>get</camunda:connectorId>
          </camunda:connector>
        </extensionElements>
      </serviceTask>
    </process>
  </definitions>`;
  const definition = await getDefinition(source, extensions);

  definition.environment.assignVariables({
    paths: ['/pal', '/franz', '/immanuel']
  });
  definition.environment.addService('get', request.get);

  return definition;
}
