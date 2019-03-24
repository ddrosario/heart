import React from "react";
import "./DynamicForm.scss";
import PropTypes from "prop-types";
import { isEqual } from "lodash";

import { dynamicFormMaker } from "./DynamicFormMaker";
import { isFieldValid } from "./validation";
import {
  _validateAllAnswers,
  _getDefaultFormData,
  _handleNewQuestions,
  _toggleValueInArray,
  _searchForDataBy,
  _getStateFromPersistence,
  _determineSubmitBtnState
} from "./formMethods";
import { SubmitBtn, EditableModeControls } from "./DynamicFormMaker/FormBtns";

// TODO: update DF repo new changes as of 11/6/18
/**
 * @prop {array} questions array of Question data objects for rendering
 * @prop {string} purpose Dynamic Form collection name (for form data persistence)
 * @prop {array} questions array of Dynamic Question objects
 *
 * -- OPTIONAL --
 * @prop {object} initialData CAUTION: very delicate - must match expected shape EXACTLY. Provide initial form_data.
 * @prop {object} hiddenData values for 'hidden' input types -> { field_name: value }
 * @prop {bool} persistence controls storing form data in LS onFormChange
 * @prop {func} onSubmit wrapper callback for handling submit behavior
 * @prop {func} onDelete wrapper callback for handling deletion behavior
 * @prop {func} onValidate callback for whole form validation
 * @prop {func} onInputChange observation-only handler with args (field_name, value, form_data)
 * @prop {func} customComponents custom input_type components (merged with defaults, precedence to custom components)
 * @prop {bool} editable controls whether form is editable or non-editable
 */
class DynamicFormContainer extends React.Component {
  state = {
    form_data: {},
    questions: [],
    fields_is_valid: {},
    editable: true,
    editableMode: false
  };

  componentDidMount() {
    const {
      initialData,
      purpose,
      questions,
      editable,
      editableMode
    } = this.props;
    const state = { questions };

    const persistence = window.localStorage.getItem(purpose);
    if (persistence) {
      const persisted_state = _getStateFromPersistence(
        state,
        persistence,
        initialData
      );
      return this.setState(persisted_state);
    }

    // get initial default values
    state.form_data = _getDefaultFormData(questions);

    // merge with initialData if available
    if (initialData) state.form_data = { ...state.form_data, ...initialData };

    // validate all answers (defaults and any provided by initialData)
    // uses onValidate() or isFieldValid() on each question / form_data field value
    const { fields_is_valid } = _validateAllAnswers(
      state.form_data,
      questions,
      0,
      this.props.onValidate
    );
    state.fields_is_valid = fields_is_valid;

    // // checks if the form should NOT be editable
    if (!editable) {
      state.editable = editable;
    }

    if (editableMode) {
      state.editableMode = editableMode;
    }

    return this.setState(state);
  }

  setInitialValues = (questions, initialData) => {
    let form_data = _getDefaultFormData(questions);
    if (initialData) {
      form_data = { ...form_data, ...initialData };
    }
    this.setState({ form_data });
  };

  componentDidUpdate(prevProps) {
    // when the form_data is updated from onFormChange
    const { form_data, fields_is_valid } = this.state;
    // or it receives new questions (for multi-question sets)
    const { purpose, persistence, questions } = this.props;

    // persistence in LS
    if (persistence) {
      const persistedData = JSON.stringify({
        form_data,
        fields_is_valid
      });
      localStorage.setItem(purpose, persistedData);
    }

    // update form_data when a new question set is introduced
    // handles cases where multiple question sets may be introduced by
    // the DF Wrapper managing the DF Container
    if (!isEqual(questions, prevProps.questions)) {
      // only update if question set changes, performance of deep equal?
      const new_form_data = _handleNewQuestions(questions, form_data);
      this.setState({ form_data: new_form_data, questions });
    }
  }

  /**
   * updates 'form_data' in state
   * - calls onValidate(input_type, value, minlength, maxlength)
   *   - true: invalid field -> disable submit
   *   - false: valid field
   * - calls onInputChange(field_name, value, form_data)
   *   - observation only
   * - toggles or sets response value for 'question'
   */
  _handleInputChange = ({ currentTarget, min, max }) => {
    const { name, value, type } = currentTarget;

    const form_data = { ...this.state.form_data };
    const fields_is_valid = { ...this.state.fields_is_valid };

    const { onInputChange, onValidate } = this.props;

    const QA_Object = _searchForDataBy(
      "field_name",
      name,
      this.props.questions
    );

    const optional = QA_Object.optional;

    // provides observational window into form data
    // no control over behavior at this time
    onInputChange && onInputChange(name, value, form_data);

    form_data[name] =
      type === "checkbox"
        ? _toggleValueInArray(form_data[name], value, max)
        : (form_data[name] = value);

    const validateField = onValidate || isFieldValid;
    fields_is_valid[`${name}_is_valid`] = validateField(
      type,
      form_data[name],
      min,
      max,
      optional
    );

    this.setState({ form_data, fields_is_valid });
  };

  /**
   * calls DynamicFormMaker()
   * - creates form Question components for each 'question'
   */
  renderInputs = () =>
    dynamicFormMaker(
      this.state.questions,
      this.state.form_data,
      this._handleInputChange,
      this.props.customComponents,
      this.state.editable
    );

  toggleEdit = () => {
    let { editable, form_data } = this.state;
    console.log(form_data);
    if (editable) {
      this.props.onSubmit(form_data);
    }
    this.setState({ editable: !this.state.editable });
  };

  cancelEdit = e => {
    e.preventDefault();
    this.setInitialValues(this.props.questions, this.props.initialData);
    this.setState({ editable: false });
  };

  render() {
    const { editable, editableMode, form_data, fields_is_valid } = this.state;
    let submitBtnState = _determineSubmitBtnState(fields_is_valid);

    let renderSubmitBtn = !editableMode ? (
      <SubmitBtn
        form_data={form_data}
        disabled={submitBtnState}
        onSubmit={this.props.onSubmit}
      />
    ) : (
      <EditableModeControls
        editable={editable}
        disabled={submitBtnState}
        deleteItem={this.props.onDelete}
        toggleEdit={this.toggleEdit}
        cancelEdit={this.cancelEdit}
      />
    );

    return (
      <>
        {this.renderInputs()}
        {renderSubmitBtn}
      </>
    );
  }
}

const questionShape = {
  id: PropTypes.string, // mongo oID of Dynamic Question
  text: PropTypes.string, // user facing text
  subtext: PropTypes.oneOfType([
    // user facing extra info
    PropTypes.string, // text
    PropTypes.element // <a> link
  ]),
  input_type: PropTypes.string, // html input type
  field_name: PropTypes.string, // form field name
  options: PropTypes.arrayOf(
    // selection options
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.object,
      // { text, value } option for different user facing text and stored value
      PropTypes.shape({
        text: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
      })
    ])
  ),
  minlength: PropTypes.number, // min length or number of choices
  maxlength: PropTypes.number, // max length or number of choices
  placeholder: PropTypes.string, // placeholder text
  isMulti: PropTypes.bool // multiple option for dropdown
};

DynamicFormContainer.propTypes = {
  purpose: PropTypes.string, // used for labeling persisted form data
  questions: PropTypes.arrayOf(PropTypes.shape(questionShape)),
  customComponents: PropTypes.func, // custom input_type components
  hiddenData: PropTypes.object, // values for hidden fields
  initialData: PropTypes.object, // initial form_data - USE SPARINGLY, very delicate
  persistence: PropTypes.bool, // enable LS form data persistence
  onSubmit: PropTypes.func, // optional handler for form submission
  onValidate: PropTypes.func, // optional handler for field validation
  onInputChange: PropTypes.func, // optional observation-only handler for viewing form data on change
  editable: PropTypes.bool
};

export default DynamicFormContainer;
