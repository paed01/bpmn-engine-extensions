'use strict';

const camundaExtensions = require('../../../resources/camunda');
const {EventEmitter} = require('events');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('Result variable', () => {
  let definition;
  beforeEach(async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <serviceTask id="serviceTask" name="Get" camunda:expression="\${services.getService()}" camunda:resultVariable="taskOutput" />
      </process>
    </definitions>`;
    definition = await getDefinition(source, extensions);
  });

  it('ServiceTask with resultVariable is stored as output', (done) => {
    definition.environment.addService('getService', () => {
      return function serviceFn(inputContext, callback) {
        callback(null, inputContext.variables.input, 'success');
      };
    });
    definition.environment.set('input', 1);

    const listener = new EventEmitter();
    definition.environment.setListener(listener);

    listener.on('end-serviceTask', (activityApi) => {
      expect(activityApi.getOutput()).to.eql([1, 'success']);
    });

    definition.on('end', (exec) => {
      expect(exec.getOutput()).to.eql({taskOutput: [1, 'success']});
      done();
    });

    definition.execute();
  });
});
