'use strict';

const {camunda} = require('../../../resources');
const {Engine} = require('bpmn-engine');
const {EventEmitter} = require('events');

const extensions = {
  camunda
};

describe('formKey', () => {
  it('start event emits wait', (done) => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="form1" />
      </process>
    </definitions>`;

    const engine = new Engine({
      source,
      extensions
    });

    const listener = new EventEmitter();
    listener.once('wait-start', (activityApi) => {
      activityApi.form.setFieldValue('key', activityApi.form.id);
      activityApi.signal();
    });

    engine.once('end', (execution) => {
      expect(execution.getOutput()).to.eql({
        key: 'form1'
      });
      done();
    });

    engine.execute({
      listener
    });
  });

  it('sets key value with expression', (done) => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="\${variables.inputForm}" />
        <userTask id="task" camunda:formKey="\${formKey}">
          <extensionElements>
            <camunda:InputOutput>
              <camunda:inputParameter name="formKey">MyForm</camunda:inputParameter>
              <camunda:outputParameter name="key">\${key}</camunda:outputParameter>
            </camunda:InputOutput>
          </extensionElements>
        </userTask>
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      </process>
    </definitions>`;

    const engine = new Engine({
      source,
      extensions
    });

    const listener = new EventEmitter();
    listener.once('wait-start', (activityApi) => {
      expect(activityApi.form.formKey).to.equal('form1');
      activityApi.signal({ inputForm: 'form2' });
    });
    listener.once('wait-task', (activityApi) => {
      activityApi.signal({ key: activityApi.form.formKey });
    });

    engine.once('end', (execution) => {
      expect(execution.getOutput()).to.eql({
        inputForm: 'form2',
        key: 'MyForm'
      });
      done();
    });

    engine.execute({
      listener,
      variables: {
        inputForm: 'form1'
      }
    });
  });

  it('getState() returns formKey value', (done) => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="\${variables.inputForm}" />
        <userTask id="task" camunda:formKey="\${variables.inputForm}" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      </process>
    </definitions>`;

    const engine = new Engine({
      source,
      extensions
    });

    const listener = new EventEmitter();
    listener.once('wait-start', () => {
      engine.stop();
    });

    engine.execute({
      listener,
      variables: {
        inputForm: 'input'
      }
    });

    engine.on('end', () => {
      const state = engine.getState();

      const startEventState = state.definitions[0].processes.theProcess.children[0];
      expect(startEventState).to.have.property('io');
      expect(startEventState.io).to.have.property('form');
      expect(startEventState.io.form).to.have.property('formKey', 'input');

      done();
    });
  });

  it('resumes with resolved formKey value', (done) => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKeyDef" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="\${variables.inputForm}" />
        <userTask id="task" camunda:formKey="\${variables.inputForm}-\${output.user}-\${output.pass}" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      </process>
    </definitions>`;

    const engine = new Engine({
      source,
      extensions
    });

    let listener = new EventEmitter();
    listener.once('wait-start', (activityApi) => {
      expect(activityApi.form.formKey).to.equal('input');

      activityApi.form.setFieldValue('user', 'name');
      activityApi.form.setFieldValue('pass', 'word');

      engine.stop();
    });

    engine.execute({
      listener,
      variables: {
        inputForm: 'input'
      }
    });

    engine.on('end', () => {
      resume(engine.getState());
    });

    function resume(state) {
      state.definitions[0].processes.theProcess.environment.variables = {inputForm: 'output'};
      listener = new EventEmitter();

      listener.on('wait-start', (activityApi) => {
        const {signal, form} = activityApi;
        expect(form.formKey).to.equal('input');
        signal();
      });

      listener.on('wait-task', ({form, signal}) => {
        signal({
          myKey: form.formKey
        });
      });

      Engine.resume(state, {listener, extensions}, (err, execution) => {
        if (err) return done(err);
        expect(execution.getOutput()).to.eql({
          user: 'name',
          pass: 'word',
          myKey: 'output-name-word'
        });
        done();
      });

    }
  });
});
