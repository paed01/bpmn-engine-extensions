'use strict';

const Debug = require('debug');
const FormField = require('./FormField');

module.exports = Form;

function Form(formData, {environment}) {
  const formFields = formData.fields;
  if (!formFields || !formFields.length) return;

  const {id, $type: type} = formData;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);

  return {
    id,
    type,
    activate
  };

  function activate(parentApi, inputContext) {
    let fields;
    const {index, isLoopContext} = inputContext;

    const {id: activityId} = parentApi;
    debug(`<${activityId}>${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const formApi = {
      type,
      activate,
      getField,
      getFields,
      getFieldValue,
      getInput,
      getOutput,
      getState,
      reset,
      resume,
      setFieldValue
    };

    return formApi;

    function getField(fieldId) {
      return internalGetFields().find((f) => f.id === fieldId);
    }

    function getFields() {
      return internalGetFields().slice();
    }

    function setFieldValue(fieldId, value) {
      const field = getField(fieldId);
      if (!field) return false;
      return field.set(value);
    }

    function getFieldValue(fieldId) {
      const field = getField(fieldId);
      if (field) return field.get();
    }

    function getState() {
      const fieldState = getFieldState();
      if (!fieldState.length) return {};

      return {
        form: {
          fields: fieldState
        }
      };
    }

    function getInput() {
      return internalGetFields().reduce((result, f) => {
        result[f.id] = f.get();
        return result;
      }, {});
    }

    function getOutput() {
      return internalGetFields().reduce((result, f) => {
        const val = f.get();
        if (val !== undefined) {
          result[f.id] = f.get();
        }
        return result;
      }, {});
    }

    function resume(state) {
      if (!state || !state.form || !state.form.fields) return;

      debug('resume');
      internalGetFields().forEach((field) => {
        const fieldState = state.form.fields.find(fstate => fstate.id === field.id);
        if (fieldState) field.resume(fieldState);
      });
      return formApi;
    }

    function internalGetFields() {
      if (!fields) {
        debug('load fields', formFields.length);
        fields = formFields.map((formField) => FormField(formField, inputContext, environment));
      }
      return fields;
    }

    function reset() {
      internalGetFields().forEach((f) => f.reset());
    }

    function getFieldState() {
      return internalGetFields().reduce((result, f) => {
        const fieldState = f.getState();
        if (fieldState.hasOwnProperty('value')) result.push(fieldState);
        else if (fieldState.label) result.push(fieldState);
        return result;
      }, []);
    }
  }
}
