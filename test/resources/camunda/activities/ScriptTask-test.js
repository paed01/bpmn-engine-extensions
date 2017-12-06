'use strict';

const camundaExtensions = require('../../../../resources/camunda');
const {getDefinition} = require('../../../helpers/testHelpers');

const extensions = {
  camunda: camundaExtensions
};

describe('ScriptTask', () => {
  describe('io', () => {
    it('returns input context if no input parameters', (done) => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="ping" name="ping" scriptFormat="Javascript">
            <script>
              <![CDATA[
                next(null, {output: variables.input});
              ]]>
            </script>
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged" value="\${output}" />
              </camunda:inputOutput>
            </extensionElements>
          </scriptTask>
        </process>
      </definitions>`;

      getDefinition(source, extensions).then((definition) => {
        definition.environment.set('input', 2);

        const task = definition.getChildActivityById('ping');

        task.once('end', (activityApi, executionContext) => {
          const output = executionContext.getOutput();
          expect(output).to.eql({
            pinged: 2
          });
          done();
        });

        task.run();
      }).catch(done);
    });
  });
});
