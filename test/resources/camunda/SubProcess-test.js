'use strict';

const camundaExtensions = require('../../../resources/camunda');
const {Engine} = require('bpmn-engine');

const extensions = {
  camunda: camundaExtensions
};

describe('SubProcess', () => {
  describe('IO', () => {
    it('transfers input as environment options', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="mainProcess" isExecutable="true">
          <bpmn:subProcess id="subProcess" name="Wrapped">
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="api">\${variables.apiPath}</camunda:inputParameter>
                <camunda:inputParameter name="serviceFn">\${services.put}</camunda:inputParameter>
                <camunda:outputParameter name="result">\${output.result}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
            <bpmn:serviceTask id="subServiceTask" name="Put" camunda:expression="\${serviceFn()}">
              <bpmn:extensionElements>
                <camunda:inputOutput>
                  <camunda:inputParameter name="uri">\${api}</camunda:inputParameter>
                  <camunda:outputParameter name="result">\${result[0]}</camunda:outputParameter>
                </camunda:inputOutput>
              </bpmn:extensionElements>
            </bpmn:serviceTask>
          </bpmn:subProcess>
        </bpmn:process>
      </bpmn:definitions>`;

      const engine = new Engine({
        source,
        extensions,
      });

      engine.execute({
        services: {
          put: () => {
            return ({uri}, next) => {
              if (uri !== 'https://api.example.com/v1') return next(new Error(`Wrong uri ${uri}`));
              next(null, 1);
            };
          }
        },
        variables: {
          apiPath: 'https://api.example.com/v1'
        }
      });

      engine.once('end', (execution) => {
        expect(execution.getOutput()).to.eql({
          result: 1
        });
        done();
      });
    });
  });

  describe('looped', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="sequentialLoopProcess" isExecutable="true">
      <subProcess id="sub-process-task" name="Wrapped">
        <multiInstanceLoopCharacteristics isSequential="false" camunda:collection="\${variables.inputList}">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:outputParameter name="result">\${output.result}</camunda:outputParameter>
          </camunda:inputOutput>
        </extensionElements>

        <serviceTask id="serviceTask" name="Put" implementation="\${services.loop}">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${variables.prefix} \${item}</camunda:inputParameter>
              <camunda:outputParameter name="result">\${result[0]}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </serviceTask>
      </subProcess>
      </process>
    </definitions>`;

    it('transfers loop message as options', (done) => {
      const engine = new Engine({
        source,
        extensions
      });

      engine.execute({
        services: {
          loop: (input, next) => {
            next(null, input.input);
          }
        },
        variables: {
          prefix: 'sub',
          inputList: ['labour', 'archiving', 'shopping']
        }
      });

      engine.once('end', (execution) => {
        expect(execution.getOutput()).to.eql({
          result: 'sub shopping'
        });
        done();
      });
    });
  });
});

