'use strict';

const factory = require('../../helpers/factory');
const nock = require('nock');
const testHelpers = require('../../helpers/testHelpers');
const {camunda} = require('../../../resources');
const {EventEmitter} = require('events');
const {Engine, Definition} = require('bpmn-engine');

const {getDefinition} = testHelpers;

const extensions = {
  camunda
};

describe('Camunda extension', () => {
  describe('behavior', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testIoSpec" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputRef" dataObjectRef="input" />
        <dataObjectReference id="staticRef" dataObjectRef="static" />
        <dataObjectReference id="surnameRef" dataObjectRef="surname" />
        <dataObjectReference id="givenNameRef" dataObjectRef="givenName" />
        <dataObject id="input" />
        <dataObject id="static" />
        <dataObject id="surname" />
        <dataObject id="givenName" />
        <startEvent id="theStart" />
        <userTask id="task-form-only">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_surname" label="\${variables.surnameLabel}" defaultValue="\${variables.surname}" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <userTask id="task-io-combo">
          <extensionElements>
            <camunda:InputOutput>
              <camunda:inputParameter name="input">\${variables.input}</camunda:inputParameter>
              <camunda:outputParameter name="result">\${signal}</camunda:outputParameter>
            </camunda:InputOutput>
          </extensionElements>
          <ioSpecification id="inputSpec1">
            <dataInput id="input_1" name="input" />
            <dataInput id="staticField" name="static" />
            <dataOutput id="signalOutput" name="signal" />
            <inputSet id="inputSet_1">
              <dataInputRefs>input_1</dataInputRefs>
              <dataInputRefs>staticField</dataInputRefs>
            </inputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput" sourceRef="input_1" targetRef="inputRef" />
          <dataInputAssociation id="associatedStatic" sourceRef="staticField" targetRef="staticRef" />
          <dataOutputAssociation id="associatedOutput" sourceRef="signalOutput" targetRef="surnameRef" />
        </userTask>
        <userTask id="task-io-form-combo">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_age" label="\${surname} age" defaultValue="\${variables.input}" />
              <camunda:formField id="field_givename" label="Before \${surname}" defaultValue="\${variables.givenName}" />
            </camunda:formData>
          </extensionElements>
          <ioSpecification id="inputSpec2">
            <dataInput id="input_2" name="age" />
            <dataInput id="input_3" name="surname" />
            <dataOutput id="givenNameField" name="field_givename" />
            <dataOutput id="ageField" name="field_age" />
            <outputSet id="outputSet_2">
              <dataOutputRefs>givenNameField</dataOutputRefs>
              <dataOutputRefs>ageField</dataOutputRefs>
            </outputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput_2" sourceRef="input_2" targetRef="inputRef" />
          <dataInputAssociation id="associatedInput_3" sourceRef="input_3" targetRef="surnameRef" />
          <dataOutputAssociation id="associatedOutput_2" sourceRef="givenNameField" targetRef="givenNameRef" />
          <dataOutputAssociation id="associatedOutput_3" sourceRef="ageField" targetRef="inputRef" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task-form-only" />
        <sequenceFlow id="flow2" sourceRef="task-form" targetRef="task-io-spec" />
        <sequenceFlow id="flow3" sourceRef="task-io-combo" targetRef="task-io-combo-form" />
        <sequenceFlow id="flow4" sourceRef="task-io-combo-form" targetRef="theEnd" />
      </process>
    </definitions>`;

    let definition;
    beforeEach(async () => {
      definition = await getDefinition(source, extensions);
    });

    describe('no specified io', () => {
      it('returns empty input and output', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);

        const activity = definition.getChildActivityById('theStart');

        activity.on('enter', (activityApi, activityExecution) => {
          expect(activityExecution.getInput()).to.be.undefined;
        });
        activity.on('end', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          expect(api.getOutput()).to.be.undefined;
          done();
        });

        activity.activate().run();
      });
    });

    describe('with form only', () => {
      it('saves form data to environment', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);
        definition.environment.set('surnameLabel', 'Surname?');

        const activity = definition.getChildActivityById('task-form-only');

        activity.on('wait', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          expect(api.form).to.be.ok;
          expect(api.form.getFields()).to.have.length(1);

          expect(api.form.getField('field_surname').label).to.equal('Surname?');
          expect(api.form.getField('field_surname').defaultValue).to.be.undefined;

          api.form.setFieldValue('field_surname', 'Edman');

          api.signal();
        });

        activity.on('end', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          expect(api.getOutput()).to.eql({
            field_surname: 'Edman'
          });

          activityExecution.save();
          expect(definition.environment.getOutput()).to.eql({
            field_surname: 'Edman'
          });

          done();
        });

        activity.activate().run();
      });
    });

    describe('combined io', () => {
      it('returns expected input and output', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);

        const activity = definition.getChildActivityById('task-io-combo');

        activity.on('wait', (activityApi, activityExecution) => {
          expect(activityExecution.getInput()).to.eql({
            input: 1,
            static: 2
          });

          activityExecution.signal({
            signal: 'a'
          });
        });

        activity.on('end', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          expect(api.getOutput()).to.eql({
            result: 'a',
            signal: 'a'
          });

          activityExecution.save();
          expect(definition.environment.getOutput()).to.eql({
            result: 'a',
            surname: 'a'
          });

          done();
        });

        activity.activate().run();
      });

      it.skip('with form only set form properties', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);
        definition.environment.set('surname', 'Edman');

        const activity = definition.getChildActivityById('task-io-form-combo');

        activity.on('wait', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          expect(activityExecution.getInput()).to.equal({
            age: 1,
            surname: 'Edman',
            field_age: 1,
            field_givename: undefined,
          });

          const field1 = api.form.getField('field_age');
          expect(field1.defaultValue).to.equal(1);
          expect(field1.label).to.equal('Edman age');

          const field2 = api.form.getField('field_givename');
          expect(field2.defaultValue).to.be.undefined();
          expect(field2.label).to.equal('Before Edman');

          api.form.setFieldValue('field_age', 2);
          api.form.setFieldValue('field_givename', 'P');

          activityExecution.signal();
        });

        activity.on('end', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);

          expect(api.getOutput()).to.equal({
            givenNameField: 'P',
            ageField: 2
          });

          activityExecution.save();
          expect(definition.environment.getOutput()).to.equal({
            input: 2,
            givenName: 'P'
          });

          done();
        });

        activity.activate().run();
      });
    });

    describe('getState()', () => {
      it('returns state per io', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);

        const activity = definition.getChildActivityById('task-io-combo');

        let state;
        activity.on('wait', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          state = api.getState();
          api.stop();

          expect(state.io, 'io').to.be.ok;
          expect(state.io.ioSpecification, 'io.ioSpecification').to.be.ok;
          expect(state.io.ioSpecification).to.eql({
            input: {
              input: 1,
              static: 2
            }
          });

          done();
        });
        activity.activate().run();
      });
    });

    describe('resume()', () => {
      it('resumes state per io', (done) => {
        definition.environment.set('input', 1);
        definition.environment.set('static', 2);

        const activity = definition.getChildActivityById('task-io-combo');

        activity.on('wait', (activityApi, activityExecution) => {
          const api = activityApi.getApi(activityExecution);
          const state = api.getState();
          api.stop();

          definition.environment.set('input', 'a');

          const resumedDefinition = Definition(definition.getState().moddleContext, {extensions});
          resumedDefinition.environment.set('input', 1);
          resumedDefinition.environment.set('static', 3);

          const resumedActivity = resumedDefinition.getChildActivityById('task-io-combo');

          const resumed = resumedActivity.activate(state);
          resumedActivity.on('wait', (resumedActivityApi, resumedExecution) => {
            const resumedApi = resumedActivityApi.getApi(resumedExecution);
            expect(resumedApi.getInput()).to.eql({
              input: 1,
              static: 2
            });

            done();
          });

          resumed.resume();
        });

        activity.activate().run();
      });
    });

  });

  describe('loop', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testIoSpec" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputRef" dataObjectRef="input" />
        <dataObjectReference id="staticRef" dataObjectRef="static" />
        <dataObjectReference id="ageRef" dataObjectRef="age" />
        <dataObjectReference id="givenNameRef" dataObjectRef="givenName" />
        <dataObject id="input" />
        <dataObject id="static" />
        <dataObject id="age" />
        <dataObject id="givenName" />
        <userTask id="task-io-loop">
          <multiInstanceLoopCharacteristics isSequential="false" camunda:collection="\${variables.list}">
            <completionCondition xsi:type="tFormalExpression">\${services.condition(index)}</completionCondition>
            <loopCardinality xsi:type="tFormalExpression">3</loopCardinality>
          </multiInstanceLoopCharacteristics>
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_item" label="\${item.item}" />
              <camunda:formField id="field_age" label="\${variables.surname} age" defaultValue="\${index}" />
              <camunda:formField id="field_givename" label="Before \${variables.surname}" defaultValue="\${givenName}" />
            </camunda:formData>
          </extensionElements>
          <ioSpecification id="inputSpec2">
            <dataInput id="input_item" name="item" />
            <dataInput id="input_index" name="index" />
            <dataInput id="input_age" name="age" />
            <dataOutput id="givenNameField" name="field_givename" />
            <dataOutput id="ageField" name="field_age" />
            <outputSet id="outputSet_2">
              <dataOutputRefs>givenNameField</dataOutputRefs>
              <dataOutputRefs>ageField</dataOutputRefs>
            </outputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput_3" sourceRef="input_age" targetRef="ageRef" />
          <dataOutputAssociation id="associatedOutput_2" sourceRef="givenNameField" targetRef="givenNameRef" />
          <dataOutputAssociation id="associatedOutput_3" sourceRef="ageField" targetRef="inputRef" />
        </userTask>
      </process>
    </definitions>`;

    let definition;
    beforeEach(async () => {
      definition = await getDefinition(source, extensions);
    });

    it('io is loop aware', (done) => {
      definition.environment.set('input', 1);
      definition.environment.set('static', 2);
      definition.environment.set('list', [{
        item: 'a'
      }, {
        item: 'b'
      }]);

      const activity = definition.getChildActivityById('task-io-loop');
      activity.on('wait', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);
        expect(activityExecution.getIo().isLoopContext).to.be.true;
        api.signal();
      });

      activity.on('end', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);
        if (!api.loop) return;
        done();
      });

      activity.activate().run();
    });

    it('resolves input per iteration', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];
      definition.environment.set('age', 1);
      definition.environment.set('surname', 'von Rosen');
      definition.environment.set('list', list);

      const activity = definition.getChildActivityById('task-io-loop');
      activity.on('wait', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);

        const input = api.getInput();

        expect(input).to.include({
          age: 1,
          index: input.index,
          item: list[input.index]
        });
        api.signal();
      });

      activity.on('end', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);
        if (!api.loop) return;
        done();
      });

      activity.activate().run();
    });

    it('resolves form per iteration', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];

      definition.environment.set('age', 1);
      definition.environment.set('surname', 'von Rosen');
      definition.environment.set('list', list);

      const activity = definition.getChildActivityById('task-io-loop');

      activity.on('wait', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);

        const {index} = api.getInput();

        const {getField} = api.form;
        expect(getField('field_item').label).to.equal(list[index].item);
        expect(getField('field_item').defaultValue).to.be.undefined;
        expect(getField('field_age').label).to.equal('von Rosen age');
        expect(getField('field_age').defaultValue).to.equal(index);
        expect(getField('field_givename').label).to.equal('Before von Rosen');
        expect(getField('field_givename').defaultValue).to.be.undefined;

        api.signal();
      });

      activity.on('end', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);
        if (!api.loop) return;
        done();
      });

      activity.activate().run();
    });

    it('ioSpecification saves result on iteration end', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];

      definition.environment.set('list', list);

      const activity = definition.getChildActivityById('task-io-loop');
      activity.on('wait', (activityApi, activityExecution) => {
        const api = activityApi.getApi(activityExecution);

        const {index} = api.getInput();

        const {setFieldValue} = api.form;

        setFieldValue('field_item', `item ${index}`);
        setFieldValue('field_age', index);
        setFieldValue('field_givename', `Jr ${index}`);

        api.signal();
      });

      activity.on('leave', (activityApi, activityExecution) => {
        if (activityExecution.isLoopContext) return;

        activityExecution.save();
        expect(definition.environment.getOutput()).to.eql({
          givenName: [ 'Jr 0', 'Jr 1', 'Jr 2' ],
          input: [ 0, 1, 2 ]
        });

        done();
      });

      activity.activate().run();
    });

  });

  describe('issue-19 - on error', () => {
    let services;
    const source = factory.resource('issue-19-2.bpmn');
    before((done) => {
      testHelpers.statusCodeOk = (statusCode) => {
        return statusCode === 200;
      };
      testHelpers.extractErrorCode = (errorMessage) => {
        if (!errorMessage) return;
        const codeMatch = errorMessage.match(/^([A-Z_]+):.+/);
        if (codeMatch) return codeMatch[1];
      };

      services = {
        get: {
          module: 'request',
          fnName: 'get'
        },
        statusCodeOk: {
          module: require.resolve('../../helpers/testHelpers'),
          fnName: 'statusCodeOk'
        },
        extractErrorCode: {
          module: require.resolve('../../helpers/testHelpers'),
          fnName: 'extractErrorCode'
        }
      };

      done();
    });

    it('completes when returning to request after resume', (done) => {
      testHelpers.statusCodeOk = (statusCode) => {
        return statusCode === 200;
      };

      let state;
      const engine = Engine({
        source,
        extensions
      });
      const listener = new EventEmitter();

      listener.on('start', () => {
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (activityApi) => {
          activityApi.signal();
        });

        nock('http://example.com')
          .get('/api')
          .reply(200, {
            status: 'OK'
          });

        const engine2 = Engine.resume(state, {
          extensions,
          listener: listener2
        });
        engine2.once('end', (execution) => {
          expect(execution.getOutput()).to.eql({
            statusCode: 200,
            body: {
              status: 'OK'
            },
            retry: true
          });
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .reply(502);

      engine.execute({
        listener,
        services,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        }
      });

    });

    it('caught error is saved to variables', (done) => {
      let state;
      const engine = Engine({
        source,
        extensions
      });
      const listener = new EventEmitter();

      listener.on('start', () => {
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (task) => {
          task.signal();
        });

        nock('http://example.com')
          .get('/api')
          .reply(200, {
            status: 'OK'
          });

        const engine2 = Engine.resume(state, {
          extensions,
          listener: listener2
        });
        engine2.once('end', (execution2, definitionExecution) => {
          expect(execution2.getOutput()).to.eql({
            retry: true,
            errorCode: 'REQ_FAIL',
            requestErrorMessage: 'REQ_FAIL: Error message',
            statusCode: 200,
            body: {
              status: 'OK'
            }
          });
          expect(definitionExecution.getChildState('terminateEvent').taken).to.be.undefined;
          expect(definitionExecution.getChildState('end').taken).to.be.true;
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .replyWithError(new Error('REQ_FAIL: Error message'));

      engine.execute({
        listener,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        },
        services: services
      });
    });

    it('takes decision based on error', (done) => {
      let state;
      const engine = Engine({
        source,
        extensions
      });
      const listener = new EventEmitter();

      listener.on('start', () => {
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (activityApi) => {
          activityApi.signal();
        });

        nock('http://example.com')
          .get('/api')
          .replyWithError(new Error('RETRY_FAIL: Error message'));

        const engine2 = Engine.resume(state, {
          extensions,
          listener: listener2
        });
        engine2.once('end', (execution, definitionExecution) => {
          expect(definitionExecution.getOutput()).to.eql({
            retry: true,
            errorCode: 'RETRY_FAIL',
            requestErrorMessage: 'RETRY_FAIL: Error message'
          });
          expect(definitionExecution.getChildState('terminateEvent').taken).to.be.true;
          expect(definitionExecution.getChildState('end').taken).to.be.undefined;
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .replyWithError(new Error('REQ_FAIL: Error message'));

      engine.execute({
        listener,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        },
        services
      });
    });
  });

  describe('issue 23', () => {
    it('looped exclusiveGateway with io should trigger end event', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="issue-23" isExecutable="true">
          <startEvent id="start" />
          <task id="task1" />
          <task id="task2">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:outputParameter name="tookDecision">\${variables.decision}</camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </task>
          <exclusiveGateway id="decision" default="flow4">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:outputParameter name="decision">\${true}</camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </exclusiveGateway>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
          <sequenceFlow id="flow2" sourceRef="task1" targetRef="task2" />
          <sequenceFlow id="flow3" sourceRef="task2" targetRef="decision" />
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="task1" />
          <sequenceFlow id="flow5" sourceRef="decision" targetRef="end">
            <conditionExpression xsi:type="tFormalExpression">\${variables.tookDecision}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const engine = new Engine({
        source,
        extensions
      });
      engine.once('end', (execution, definitionExecution) => {
        expect(definitionExecution.getChildState('end').taken).to.be.true;
        done();
      });

      const listener = new EventEmitter();
      let taskCount = 0;
      listener.on('start-task1', (a) => {
        taskCount++;
        if (taskCount > 2) {
          throw new Error(`Too many <${a.id}> starts`);
        }
      });

      engine.execute({
        listener
      });
    });
  });

  describe('activity io', () => {
    let definition;
    before(async () => {
      const source = factory.resource('service-task-io-types.bpmn').toString();
      definition = await getDefinition(source, extensions);
    });

    it('getInput() without defined io returns undefined', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      expect(task).to.have.property('io');
      expect(task.io.activate(task).getInput()).to.be.undefined;
      done();
    });

    it('getOutput() without defined io returns nothing', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      expect(task.io.activate(task).getOutput()).to.be.undefined;
      done();
    });

    it('setOutputValue() assigns result', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      const activatedIo = task.io.activate(task);

      activatedIo.setOutputValue('name', 'me');
      expect(activatedIo.getOutput()).to.eql({name: 'me'});
      done();
    });

    it('setOutputValue() assigns to other result', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      const activatedIo = task.io.activate(task);
      activatedIo.setResult({
        input: 1
      });
      activatedIo.setOutputValue('name', 'me');
      expect(activatedIo.getOutput()).to.eql({
        input: 1,
        name: 'me'
      });

      done();
    });
  });

});
