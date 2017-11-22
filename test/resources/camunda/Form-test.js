'use strict';

const camundaExtensions = require('../../../resources/camunda');
const factory = require('../../helpers/factory');
const {getDefinition} = require('../../helpers/testHelpers');
const {Engine} = require('bpmn-engine');
const {EventEmitter} = require('events');

const extensions = {
  camunda: camundaExtensions
};

describe('Camunda Forms', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData />
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="input" label="\${variables.label}" defaultValue="\${input}" />
            </camunda:formData>
            <camunda:InputOutput>
              <camunda:inputParameter name="input">\${variables.input}</camunda:inputParameter>
            </camunda:InputOutput>
          </extensionElements>
        </userTask>
        <userTask id="task2">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="input" label="\${variables.label}" />
            </camunda:formData>
          </extensionElements>
        </userTask>
      </process>
    </definitions>`;

    let definition;
    beforeEach(async () => {
      definition = await getDefinition(source, extensions);
    });

    it('has access to variables and activity input when assigning label and default value', (done) => {
      definition.environment.set('input', 1);
      definition.environment.set('label', 'field label');

      const activity = definition.getChildActivityById('task');

      activity.on('enter', (activityApi, activityExecution) => {
        const form = activityExecution.getForm();
        const field = form.getField('input');

        expect(field.label, 'label').to.equal('field label');
        expect(field.get(), 'value').to.equal(1);
        done();
      });

      activity.activate().run();
    });

    it('assigned field value is returned in form output', (done) => {
      definition.environment.set('input', -1);
      definition.environment.set('label', 'field label');

      const activity = definition.getChildActivityById('task');

      activity.on('wait', (activityApi, executionContext) => {
        const api = activityApi.getApi(executionContext);
        const fields = api.form.getFields();
        fields.forEach(({set}, idx) => set(idx * 10));
        api.signal();
      });

      activity.on('end', (activityApi, executionContext) => {
        const api = activityApi.getApi(executionContext);
        expect(api.form.getOutput()).to.eql({
          input: 0
        });
        done();
      });

      activity.activate().run();
    });

    it('without fields ignores form', (done) => {
      const activity = definition.getChildActivityById('start');
      expect(activity.form).to.equal(undefined);
      activity.on('enter', (activityApi, executionContext) => {
        const activeForm = executionContext.getForm();
        expect(activeForm).to.equal(undefined);
        done();
      });
      activity.activate().run();
    });

    it('setFieldValue() of unknown field is ignored', (done) => {
      definition.environment.set('input', 1);

      const activity = definition.getChildActivityById('task');

      activity.on('enter', (activityApi, executionContext) => {
        const activeForm = executionContext.getForm();
        activeForm.setFieldValue('arb', 2);
        expect(activeForm.getOutput()).to.eql({input: 1});
        done();
      });

      activity.activate().run();
    });

    it('reset() resets fields to default value', (done) => {
      definition.environment.set('input', 1);

      const activity = definition.getChildActivityById('task');

      activity.on('enter', (activityApi, executionContext) => {
        const activeForm = executionContext.getForm();
        activeForm.setFieldValue('input', 2);
      });

      activity.on('wait', (activityApi, executionContext) => {
        const api = activityApi.getApi(executionContext);
        api.form.reset();
        api.signal();
      });

      activity.on('end', (activityApi, executionContext) => {
        const api = activityApi.getApi(executionContext);
        expect(api.form.getOutput()).to.eql({
          input: 1
        });
        done();
      });

      activity.activate().run();
    });

  });

  describe('with default value', () => {
    it('returns value from expression', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <extensionElements>
              <camunda:formData>
                <camunda:formField id="inputDate" label="Input date" type="date" defaultValue="\${variables.now}" />
              </camunda:formData>
            </extensionElements>
          </startEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
        </process>
      </definitions>`;

      const listener = new EventEmitter();
      const now = new Date('2017-02-05');

      listener.once('wait-start', (activityApi) => {
        expect(activityApi.form.getFields()[0]).to.have.property('defaultValue', now);
        done();
      });

      const engine = Engine({
        source,
        extensions
      });

      engine.execute({
        listener,
        variables: {
          now
        }
      });
    });
  });

  describe('start form', () => {
    it('waits for start', (done) => {
      const engine = new Engine({
        source: factory.resource('forms.bpmn'),
        extensions
      });

      const now = new Date('2017-02-05');
      const tomorrow = new Date('2017-02-06');
      const dayAfterTomorrow = new Date('2017-02-07');
      const listener = new EventEmitter();

      listener.once('wait-start', (activityApi) => {
        const fields = activityApi.form.getFields();

        expect(fields[0]).to.include({
          defaultValue: now
        });

        fields[0].set(tomorrow);

        activityApi.signal();
      });

      listener.once('wait-userTask', (activityApi) => {
        const fields = activityApi.form.getFields();

        expect(fields[0]).to.include({
          defaultValue: tomorrow
        });

        const reply = {};
        reply[fields[0].id] = dayAfterTomorrow;

        activityApi.signal(reply);
      });

      engine.execute({
        listener,
        variables: {
          now
        }
      });

      engine.once('end', (execution) => {
        expect(execution.getOutput()).to.include({
          startDate: dayAfterTomorrow
        });
        done();
      });
    });
  });

  describe('getState()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" label="FormField2" type="long" />
            </camunda:formData>
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="surname" label="Surname" type="string" />
              <camunda:formField id="givenName" label="Given name" type="string" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    it('returns state of form fields', (done) => {
      const engine = new Engine({
        source,
        extensions
      });

      const listener = new EventEmitter();
      listener.once('wait-start', (activityApi) => {
        engine.stop();
        const state = activityApi.getState().io.form;
        expect(state).to.have.property('fields');
        expect(state.fields).to.have.length(2);
        expect(Object.keys(state.fields[0])).to.have.same.members(['id', 'label', 'valueType']);
        expect(Object.keys(state.fields[1])).to.have.same.members(['id', 'label', 'valueType']);

        expect(state.fields[0]).to.eql({
          id: 'formfield1',
          label: 'FormField1',
          valueType: 'string'
        });
        done();
      });

      engine.execute({
        listener
      });
    });
  });

  describe('resume()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" type="long" />
            </camunda:formData>
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="surname" label="Surname" type="string" />
              <camunda:formField id="givenName" label="Given name" type="string" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    it('resumes start event with assigned values', (done) => {
      const engine = new Engine({
        source,
        extensions
      });

      let listener = new EventEmitter();
      listener.once('wait-start', (activityApi) => {
        expect(activityApi.form.setFieldValue('formfield1', 'stop')).to.equal(true);
        engine.stop();
      });

      engine.execute({
        listener
      });

      engine.on('end', () => {
        const state = engine.getState();
        listener = new EventEmitter();
        listener.on('wait-start', ({form}) => {
          const field = form.getField('formfield1');
          expect(field.get()).to.equal('stop');
          done();
        });

        Engine.resume(state, {listener, extensions});
      });
    });

    it('resumes with assigned values', (done) => {
      const engine = Engine({
        source,
        extensions
      });

      let listener = new EventEmitter();
      listener.once('wait-start', (activityApi) => {
        expect(activityApi.form.setFieldValue('formfield1', 'stop2')).to.equal(true);
        engine.stop();
      });

      engine.execute({
        listener
      });

      engine.on('end', () => {
        const state = engine.getState();
        listener = new EventEmitter();

        listener.on('wait-start', ({form, signal}) => {
          const field1 = form.getField('formfield1');
          const field2 = form.getField('formfield2');
          expect(field1.get()).to.equal('stop2');
          expect(field2.get()).to.equal(undefined);

          field2.set('resume');

          signal(form.getOutput());
        });

        listener.on('wait-task', ({signal}) => {
          signal();
        });

        Engine.resume(state, {listener, extensions}, done);
      });
    });

    it('resume fields ignores fields not in field set', (done) => {
      getDefinition(source, extensions).then((definition) => {
        const activity = definition.getChildActivityById('task');
        let state;
        activity.once('wait', (activityApi, executionContext) => {
          const api = activityApi.getApi(executionContext);
          api.form.setFieldValue('surname', 'Edman');
          state = api.getState();

          state.io.form.fields.splice(1, 1);
          state.io.form.fields.push({
            id: 'arb'
          });
          api.stop();

          activity.on('wait', (resumedActivityApi, resumedExecutionContext) => {
            const resumedApi = resumedActivityApi.getApi(resumedExecutionContext);

            expect(resumedApi.form.getFieldValue('arb')).to.equal(undefined);
            expect(resumedApi.form.getFieldValue('surname')).to.equal('Edman');

            done();
          });

          activity.activate(state).resume();
        });

        activity.activate().run();
      }).catch(done);
    });
  });
});
