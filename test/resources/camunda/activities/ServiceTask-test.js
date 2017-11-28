'use strict';

const camundaExtensions = require('../../../../resources/camunda');
const factory = require('../../../helpers/factory');
const {Engine} = require('bpmn-engine');

const extensions = {
  camunda: camundaExtensions
};

describe('ServiceTask', () => {
  it('resolves service from property named "service"', (done) => {
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
