'use strict';

const camundaExtensions = require('../../../resources/camunda');
const {Engine} = require('bpmn-engine');
const {EventEmitter} = require('events');

const extensions = {
  camunda: camundaExtensions
};

describe('MultiInstanceLoopCharacteristics', () => {
  describe('collection expression', () => {
    it('loops each item', (done) => {
      const source = `
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="true">
          <bpmn:serviceTask id="recurring" name="Each item" camunda:expression="\${services.loop}">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="\${variables.input}" />
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="item">\${item}</camunda:inputParameter>
                <camunda:inputParameter name="sum">\${item}</camunda:inputParameter>
                <camunda:outputParameter name="sum">\${result[-1][0]}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
          </bpmn:serviceTask>
        </bpmn:process>
      </bpmn:definitions>`;

      const engine = new Engine({
        source,
        extensions
      });
      const listener = new EventEmitter();

      let startCount = 0;
      listener.on('start-recurring', () => {
        startCount++;
      });

      let sum = 0;
      engine.execute({
        listener,
        services: {
          loop: (executionContext, callback) => {
            sum += executionContext.item;
            callback(null, sum);
          }
        },
        variables: {
          input: [1, 2, 3, 7]
        }
      });
      engine.once('end', () => {
        expect(startCount).to.equal(4);
        expect(sum, 'sum').to.equal(13);
        done();
      });
    });

    it('sets loop item to defined elementVariable', (done) => {
      const source = `
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="true">
          <bpmn:serviceTask id="recurring" name="Each item" camunda:expression="\${services.loop}">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="\${variables.input}" camunda:elementVariable="inputVar" />
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="item">\${inputVar}</camunda:inputParameter>
                <camunda:inputParameter name="sum">\${inputVar}</camunda:inputParameter>
                <camunda:outputParameter name="sum">\${result[-1][0]}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
          </bpmn:serviceTask>
        </bpmn:process>
      </bpmn:definitions>`;

      const engine = new Engine({
        source,
        extensions
      });
      const listener = new EventEmitter();

      let startCount = 0;
      listener.on('start-recurring', () => {
        startCount++;
      });

      let sum = 0;
      engine.execute({
        listener,
        services: {
          loop: (executionContext, callback) => {
            sum += executionContext.item;
            callback(null, sum);
          }
        },
        variables: {
          input: [1, 2, 3, 7]
        }
      });
      engine.once('end', () => {
        expect(startCount).to.equal(4);
        expect(sum, 'sum').to.equal(13);
        done();
      });
    });
  });
});
