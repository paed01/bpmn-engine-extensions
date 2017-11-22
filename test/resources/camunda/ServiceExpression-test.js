'use strict';

const camundaExtensions = require('../../../resources/camunda');
const factory = require('../../helpers/factory');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('Service expression', () => {
  let definition;
  beforeEach(async () => {
    definition = await getDefinition(factory.resource('service-task.bpmn'), extensions);
  });

  it('executes service on taken inbound', (done) => {
    definition.environment.addService('postMessage', (inputContext, next) => {
      next(null, true);
    });

    const task = definition.getChildActivityById('serviceTask');
    task.activate();

    task.once('end', (activityApi, executionContext) => {
      expect(executionContext.getOutput()).to.eql([true]);
      done();
    });

    task.inbound[0].take();
  });

  it('expression function is called with input context', (done) => {
    definition.environment.addService('postMessage', (message, callback) => {
      expect(message).to.have.property('output');
      expect(message).to.have.property('variables');
      expect(message).to.have.property('services');
      callback();
    });

    definition.execute(done);
  });

  it('error in callback caught by bound error event', (done) => {
    definition.environment.addService('postMessage', (message, callback) => {
      callback(new Error('Failed'));
    });

    const task = definition.getChildActivityById('serviceTask');
    const boundEvent = definition.getChildActivityById('errorEvent');
    boundEvent.activate();
    task.activate();

    boundEvent.once('end', (event) => {
      expect(event.getState()).to.have.property('taken', true);
      done();
    });

    task.inbound[0].take();
  });
});
