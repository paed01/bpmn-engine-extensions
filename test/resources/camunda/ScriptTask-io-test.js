'use strict';

const camundaExtensions = require('../../../resources/camunda');
const {getDefinition} = require('../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('ServiceTask IO', () => {
  describe('input', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <scriptTask id="task" scriptFormat="Javascript">
          <script>
            <![CDATA[
              next(null, input);
            ]]>
          </script>
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${variables.message}</camunda:inputParameter>
              <camunda:outputParameter name="output">Input was \${result}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </scriptTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    let definition;
    beforeEach(async () => {
      definition = await getDefinition(source, extensions);
    });

    it('script is called with input parameters', (done) => {
      definition.environment.set('message', 'executed');

      const task = definition.getChildActivityById('task');
      task.activate();
      task.once('start', (activityApi, executionContext) => {
        expect(executionContext.getInput()).to.eql({
          input: 'executed'
        });
        done();
      });

      task.inbound[0].take();
    });

    it('output expressions have access to input parameters', (done) => {
      definition.environment.set('message', 'exec');

      const task = definition.getChildActivityById('task');
      task.activate();
      task.once('end', (activity, execution) => {
        expect(execution.getOutput()).to.eql({
          output: 'Input was exec'
        });
        done();
      });

      task.inbound[0].take();
    });
  });

  describe('output', () => {
    it('parameter with name only mappes to script output property', (done) => {
      const source = `
      <definitions id="Definitions_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="1.6.0">
        <process id="Process_1" isExecutable="true">
          <scriptTask id="scriptTask" name="Execute" scriptFormat="JavaScript">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="apiPath">\${variables.apiPath}</camunda:inputParameter>
                <camunda:inputParameter name="input">\${variables.input}</camunda:inputParameter>
                <camunda:inputParameter name="path">/api/v8</camunda:inputParameter>
                <camunda:outputParameter name="calledApi">\${api}</camunda:outputParameter>
                <camunda:outputParameter name="result"></camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
            <incoming>SequenceFlow_1jgxkq2</incoming>
            <outgoing>SequenceFlow_040np9m</outgoing>
            <script><![CDATA[
            next(null, {
              api: apiPath + path,
              result: input
            })]]></script>
          </scriptTask>
        </process>
      </definitions>`;
      getDefinition(source, extensions).then((definition) => {
        definition.environment.set('apiPath', 'http://example-2.com');
        definition.environment.set('input', 8);

        const task = definition.getChildActivityById('scriptTask');

        task.once('end', (activityApi, executionContext) => {
          expect(executionContext.getOutput()).to.eql({
            calledApi: 'http://example-2.com/api/v8',
            result: 8
          });
          done();
        });

        task.run();
      }).catch(done);
    });
  });
});
