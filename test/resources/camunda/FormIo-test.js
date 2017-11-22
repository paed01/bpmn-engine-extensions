'use strict';

const {camunda} = require('../../../resources');
const {EventEmitter} = require('events');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda
};

describe('Form Io', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
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

    it('assigns form output to environment if not other io', (done) => {
      const listener = new EventEmitter();
      listener.on('wait', (activityApi) => {
        activityApi.form.setFieldValue('input', 2);
        activityApi.signal();
      });

      definition.execute({listener, extensions});
      definition.on('end', (def) => {
        expect(def.getOutput()).to.eql({input: 2});
        done();
      });
    });
  });
});
