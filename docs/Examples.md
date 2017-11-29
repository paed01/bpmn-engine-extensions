Examples
========

<!-- toc -->

- [ServiceTask](#servicetask)

<!-- tocstop -->

# Camunda ServiceTask

In the example `request.get` will be called with `variables.apiPath`. The result is saved on `variables.result`.

```javascript
const {Engine} = require('bpmn-engine');

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="Process_1" isExecutable="true">
    <startEvent id="start" />
    <serviceTask id="serviceTask" name="Get" camunda:expression="\${services.getRequest}">
      <extensionElements>
        <camunda:inputOutput>
          <camunda:inputParameter name="uri">
            <camunda:script scriptFormat="JavaScript">variables.apiPath</camunda:script>
          </camunda:inputParameter>
          <camunda:outputParameter name="result">
            <camunda:script scriptFormat="JavaScript"><![CDATA[
'use strict';
var result = {
  statusCode: result[0].statusCode,
  body: result[0].statusCode === 200 ? JSON.parse(result[1]) : undefined
};
result;
              ]]>
            </camunda:script>
          </camunda:outputParameter>
        </camunda:inputOutput>
      </extensionElements>
    </serviceTask>
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="serviceTask" />
    <sequenceFlow id="flow2" sourceRef="serviceTask" targetRef="end" />
  </process>
</definitions>`;

const engine = Engine({
  source,
  extensions: {
    camunda: require('bpmn-engine-extensions/resources/camunda')
  }
});

engine.execute({
  variables: {
    apiPath: 'http://example.com/test'
  },
  services: {
    getRequest: {
      module: 'request',
      fnName: 'get'
    }
  }
});

engine.once('end', (execution) => {
  console.log('Script task output:', execution.getOutput());
});
```

# Camunda form

```javascript
'use strict';

const {Engine} = require('bpmn-engine');
const {EventEmitter} = require('events');
const camundaExt = require('bpmn-engine-extensions/resources/camunda');

const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions id="pending" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <process id="theWaitingGame" isExecutable="true">
    <startEvent id="start" />
    <parallelGateway id="fork" />
    <userTask id="userTask1" />
    <userTask id="userTask2">
      <extensionElements>
        <camunda:formData>
          <camunda:formField id="surname" label="Surname" type="string" />
          <camunda:formField id="givenName" label="Given name" type="string" />
        </camunda:formData>
      </extensionElements>
    </userTask>
    <task id="task" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="fork" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="userTask1" />
    <sequenceFlow id="flow3" sourceRef="fork" targetRef="userTask2" />
    <sequenceFlow id="flow4" sourceRef="fork" targetRef="task" />
    <sequenceFlow id="flow5" sourceRef="userTask1" targetRef="join" />
    <sequenceFlow id="flow6" sourceRef="userTask2" targetRef="join" />
    <sequenceFlow id="flow7" sourceRef="task" targetRef="join" />
    <sequenceFlow id="flowEnd" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

const engine = new Engine({
  name: 'Camunda form',
  source,
  extensions: {
    camunda: camundaExt
  }
});

const listener = new EventEmitter();

listener.on('wait-userTask1', (api) => {
  api.signal();
})

listener.on('wait-userTask2', (api) => {
  console.log(api.form);
  api.signal();
})

engine.execute({
  listener
});
```
