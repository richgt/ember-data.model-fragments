import { ModelData } from 'ember-data/-private';
import { assert } from '@ember/debug';
import { typeOf } from '@ember/utils';
import { get, setProperties, computed } from '@ember/object';
import { isArray } from '@ember/array';
import { copy } from '@ember/object/internals';
import {
  internalModelFor,
  setFragmentOwner,
  setFragmentData,
  createFragment,
  isFragment
} from './fragment';

export default class FragmentModelData extends ModelData {
    constructor(modelName, id, store, data, internalModel) {
      super(modelName, id, store, data, internalModel);

      // TODO Optimize
      this.fragmentData = Object.create(null);
      this.fragments = Object.create(null);
      this.fragmentNames = [];
      this.internalModel.type.eachComputedProperty((name, options) => {
        if (options.isFragment) {
          this.fragmentNames.push(name)
        }
      });
    }

    // Returns the value of the property or the default propery
    getFragmentWithDefault(key, options, type) {
      let data = this.fragmentData[key];
      if (data !== undefined) {
        return data;
      }
      return getFragmentDefaultValue(options, type);
    }

    setupFragment(key, options, declaredModelName, record) {
      let data = this.getFragmentWithDefault(key, options, 'object');
      let fragment = this.fragments[key];

      // Regardless of whether being called as a setter or getter, the fragment
      // may not be initialized yet, in which case the data will contain a
      // raw response or a stashed away fragment

      // If we already have a processed fragment in _data and our current fragment is
      // null simply reuse the one from data. We can be in this state after a rollback
      // for example
      if (!fragment && isFragment(data)) {
        fragment = data;
      // Else initialize the fragment
      } else if (data && data !== fragment) {
        if (fragment) {
          setFragmentData(fragment, data);
        } else {
          fragment = createFragment(this.store, declaredModelName, record, key, options, data);
        }

        this.fragments[key] = fragment;
      } else {
        // Handle the adapter setting the fragment to null
        fragment = data;
      }

      return fragment;
    }

    setFragmentValue(key, fragment, value) {
      let store = this.store;
      assert(`You can only assign \`null\`, an object literal or a '${declaredModelName}' fragment instance to this property`, value === null || typeOf(value) === 'object' || isInstanceOfType(store.modelFor(declaredModelName), value));

      if (!value) {
        fragment = null;
      } else if (isFragment(value)) {
        // A fragment instance was given, so just replace the existing value
        fragment = setFragmentOwner(value, record, key);
      } else if (!fragment) {
        // A property hash was given but the property was null, so create a new
        // fragment with the data
        fragment = createFragment(store, declaredModelName, record, key, options, value);
      } else {
        // The fragment already exists and a property hash is given, so just set
        // its values and let the state machine take care of the dirtiness
        setProperties(fragment, value);

        return fragment;
      }

      if (this.fragments[key] !== fragment) {
        fragmentDidDirty(record, key, fragment);
      } else {
        fragmentDidReset(record, key);
      }

    }
  
    getFragment(key) {

    }
    // PUBLIC API
  
    setupData(data, calculateChange) {
      if (!data.attributes) {
        return super.setupData(data, calculateChange);
      }
      this.fragmentNames.forEach((name) => {
        if (name in data.attributes) {
          this.fragmentData[name] = data.attributes[name];
          delete data.attributes[name];
        }
      });
      return super.setupData(data, calculateChange);
    }
  
    adapterWillCommit() {
    }
  
    hasChangedAttributes() {
      return this.__attributes !== null && Object.keys(this.__attributes).length > 0;
    }
  
    // TODO, Maybe can model as destroying model data?
    resetRecord() {
      this.__attributes = null;
      this.__inFlightAttributes = null;
      this._data = null;
    }
  
    /*
      Returns an object, whose keys are changed properties, and value is an
      [oldProp, newProp] array.
  
      @method changedAttributes
      @private
    */
    changedAttributes() {
      return super.changedAttributes();
      /*
      let oldData = this._data;
      let currentData = this._attributes;
      let inFlightData = this._inFlightAttributes;
      let newData = emberAssign(copy(inFlightData), currentData);
      let diffData = Object.create(null);
      let newDataKeys = Object.keys(newData);
  
      for (let i = 0, length = newDataKeys.length; i < length; i++) {
        let key = newDataKeys[i];
        diffData[key] = [oldData[key], newData[key]];
      }
  
      return diffData;
      */
    }
  
    rollbackAttributes() {

      let keys = [];
      for (let key in this.fragments) {
        if (this.fragments[key]) {
          this.fragments[key].rollbackAttributes();
          keys.push(key);
        }
      }
      return super.rollbackAttributes();
    }
  
    adapterDidCommit(data) {
      return super.adapterDidCommit(data);
      /*
      if (data) {
        // this.store._internalModelDidReceiveRelationshipData(this.modelName, this.id, data.relationships);
        if (data.relationships) {
          this._setupRelationships(data);
        }
        data = data.attributes;
      }
      let changedKeys = this._changedKeys(data);
  
      emberAssign(this._data, this._inFlightAttributes);
      if (data) {
        emberAssign(this._data, data);
      }
  
      this._inFlightAttributes = null;
  
      this._updateChangedAttributes();
      return changedKeys;
      */
    }
    saveWasRejected() {
      return super.saveWasRejected();
      /*
      let keys = Object.keys(this._inFlightAttributes);
      if (keys.length > 0) {
        let attrs = this._attributes;
        for (let i=0; i < keys.length; i++) {
          if (attrs[keys[i]] === undefined) {
            attrs[keys[i]] = this._inFlightAttributes[keys[i]];
          }
        }
      }
      this._inFlightAttributes = null;
      */
    }

    setAttr(key, value) {
      return super.setAttr(key, value);
      /*
      let oldValue = this.getAttr(key);
      let originalValue;
  
      if (value !== oldValue) {
        // Add the new value to the changed attributes hash; it will get deleted by
        // the 'didSetProperty' handler if it is no different from the original value
        this._attributes[key] = value;
  
        if (key in this._inFlightAttributes) {
          originalValue = this._inFlightAttributes[key];
        } else {
          originalValue = this._data[key];
        }
        // If we went back to our original value, we shouldn't keep the attribute around anymore
        if (value === originalValue) {
          delete this._attributes[key];
        }
        // TODO IGOR DAVID whats up with the send
        this.internalModel.send('didSetProperty', {
          name: key,
          oldValue: oldValue,
          originalValue: originalValue,
          value: value
        });
      }
      */
    }
  
    getAttr(key) {
      return super.getAttr(key);
      /*
      if (key in this._attributes) {
        return this._attributes[key];
      } else if (key in this._inFlightAttributes) {
        return this._inFlightAttributes[key];
      } else {
        return this._data[key];
      }
      */
    }
  
    hasAttr(key) {
      return super.hasAttr(key);
      /*
      return key in this._attributes ||
            key in this._inFlightAttributes ||
            key in this._data;
            */
    }
  
  
    /*
    // TODO IGOR AND DAVID REFACTOR THIS
    didCreateLocally(properties) {
      // TODO @runspired this should also be coalesced into some form of internalModel.setState()
      this.internalModel.eachRelationship((key, descriptor) => {
        if (properties[key] !== undefined) {
          this._relationships.get(key).setHasData(true);
        }
      });
    }
  
  
    */

}