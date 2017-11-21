import { assert } from '@ember/debug';
import { copy } from '@ember/object/internals';
import { typeOf } from '@ember/utils';
import { isArray } from '@ember/array';
import { get, setProperties, computed } from '@ember/object';
import StatefulArray from './array/stateful';
import FragmentArray from './array/fragment';
import {
  fragmentDidDirty,
  fragmentDidReset
} from './states';
import {
  internalModelFor,
  setFragmentOwner,
  setFragmentData,
  createFragment,
  isFragment
} from './fragment';
import isInstanceOfType from './util/instance-of-type';

/**
  @module ember-data-model-fragments
*/

// Create a unique type string for the combination of fragment property type,
// transform type (or fragment model), and polymorphic type key
function metaTypeFor(name, type, options) {
  let metaType = `-mf-${name}`;

  if (type) {
    metaType += `$${type}`;
  }

  if (options && options.polymorphic) {
    let typeKey = options.typeKey || 'type';
    metaType += `$${typeKey}`;
  }

  return metaType;
}

/**
  `MF.fragment` defines an attribute on a `DS.Model` or `MF.Fragment`. Much
  like `DS.belongsTo`, it creates a property that returns a single fragment of
  the given type.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An object literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment. Defaults to `null`.
  - `polymorphic`: Whether or not the fragments in the array can be child
    classes of the given type.
  - `typeKey`: If `polymorphic` is true, the property to use as the fragment
    type in the normalized data. Defaults to `type`.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    name: MF.fragment('name', { defaultValue: {} })
  });

  App.Name = MF.Fragment.extend({
    first: DS.attr('string'),
    last: DS.attr('string')
  });
  ```

  @namespace MF
  @method fragment
  @param {String} type the fragment type
  @param {Object} options a hash of options
  @return {Attribute}
*/
function fragment(declaredModelName, options) {
  options = options || {};

  let metaType = metaTypeFor('fragment', declaredModelName, options);

  function setupFragment(store, record, key) {
    debugger
    let internalModel = internalModelFor(record);
    return internalModel._modelData.setupFragment(key, options, declaredModelName, record);
  }

  function setFragmentValue(record, key, fragment, value) {
    let internalModel = internalModelFor(record);
    return internalModel._modelData.setFragmentValue(key, fragment, value);
  }

  return fragmentProperty(metaType, options, setupFragment, setFragmentValue);
}

/**
  `MF.fragmentArray` defines an attribute on a `DS.Model` or `MF.Fragment`.
  Much like `DS.hasMany`, it creates a property that returns an array of
  fragments of the given type. The array is aware of its original state and so
  has a `hasDirtyAttributes` property and a `rollback` method.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An array literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment. Defaults to an empty
    array.
  - `polymorphic`: Whether or not the fragments in the array can be child
    classes of the given type.
  - `typeKey`: If `polymorphic` is true, the property to use as the fragment
    type in the normalized data. Defaults to `type`.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    addresses: MF.fragmentArray('address')
  });

  App.Address = MF.Fragment.extend({
    street: DS.attr('string'),
    city: DS.attr('string'),
    region: DS.attr('string'),
    country: DS.attr('string')
  });
  ```

  @namespace MF
  @method fragmentArray
  @param {String} type the fragment type (optional)
  @param {Object} options a hash of options
  @return {Attribute}
*/
function fragmentArray(modelName, options) {
  options || (options = {});

  let metaType = metaTypeFor('fragment-array', modelName, options);

  return fragmentArrayProperty(metaType, options, function createFragmentArray(record, key) {
    return FragmentArray.create({
      type: modelName,
      options: options,
      name: key,
      owner: record
    });
  });
}

/**
  `MF.array` defines an attribute on a `DS.Model` or `MF.Fragment`. It creates a
  property that returns an array of values of the given primitive type. The
  array is aware of its original state and so has a `hasDirtyAttributes`
  property and a `rollback` method.

  It takes an optional hash as a second parameter, currently supported options
  are:

  - `defaultValue`: An array literal or a function to be called to set the
    attribute to a default value if none is supplied. Values are deep copied
    before being used. Note that default values will be passed through the
    fragment's serializer when creating the fragment.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    aliases: MF.array('string')
  });
  ```

  @namespace MF
  @method array
  @param {String} type the type of value contained in the array
  @param {Object} options a hash of options
  @return {Attribute}
*/
function array(type, options) {
  if (typeof type === 'object') {
    options = type;
    type = undefined;
  } else {
    options || (options = {});
  }

  let metaType = metaTypeFor('array', type);

  return fragmentArrayProperty(metaType, options, function createStatefulArray(record, key) {
    return StatefulArray.create({
      options: options,
      name: key,
      owner: record
    });
  });
}

function fragmentProperty(type, options, setupFragment, setFragmentValue) {
  options = options || {};

  let meta = {
    type: type,
    isAttribute: true,
    isFragment: true,
    options: options
  };

  return computed({
    get(key) {
      let internalModel = internalModelFor(this);
      let fragment = setupFragment(this.store, this, key);

      return internalModel._modelData.fragments[key] = fragment;
    },
    set(key, value) {
      let internalModel = internalModelFor(this);
      let fragment = setupFragment(this.store, this, key);

      fragment = setFragmentValue(this, key, fragment, value);

      return internalModel._modelData.fragments[key] = fragment;
    }
  }).meta(meta);
}

function fragmentArrayProperty(metaType, options, createArray) {
  function setupFragmentArray(store, record, key) {
    let internalModel = internalModelFor(record);
    let data = getWithDefault(internalModel, key, options, 'array');
    let fragments = internalModel._modelData.fragments[key] || null;

    /*
    // If we already have a processed fragment in _data and our current fragment is
    // null simply reuse the one from data. We can be in this state after a rollback
    // for example
    if (data instanceof StatefulArray && !fragments) {
      fragments = data;
    // Create a fragment array and initialize with data
    } else if (data && data !== fragments) {
      fragments || (fragments = createArray(record, key));
      internalModel._data[key] = fragments;
      fragments.setupData(data);
    } else {
      // Handle the adapter setting the fragment array to null
      fragments = data;
    }
    */

    return fragments;
  }

  function setFragmentValue(record, key, fragments, value) {
    let internalModel = internalModelFor(record);

    if (isArray(value)) {
      fragments || (fragments = createArray(record, key));
      fragments.setObjects(value);
    } else if (value === null) {
      fragments = null;
    } else {
      assert('A fragment array property can only be assigned an array or null');
    }

    if (internalModel._modelData._data[key] !== fragments || get(fragments, 'hasDirtyAttributes')) {
      fragmentDidDirty(record, key, fragments);
    } else {
      fragmentDidReset(record, key);
    }

    return fragments;
  }

  return fragmentProperty(metaType, options, setupFragmentArray, setFragmentValue);
}

/**
  `MF.fragmentOwner` defines a read-only attribute on a `MF.Fragment`
  instance. The attribute returns a reference to the fragment's owner
  record.

  Example

  ```javascript
  App.Person = DS.Model.extend({
    name: MF.fragment('name')
  });

  App.Name = MF.Fragment.extend({
    first: DS.attr('string'),
    last: DS.attr('string'),
    person: MF.fragmentOwner()
  });
  ```

  @namespace MF
  @method fragmentOwner
  @return {Attribute}
*/
function fragmentOwner() {
  return computed(function() {
    assert('Fragment owner properties can only be used on fragments.', isFragment(this));

    return internalModelFor(this)._modelData._owner;
  }).meta({
    isFragmentOwner: true
  }).readOnly();
}

// The default value of a fragment is either an array or an object,
// which should automatically get deep copied
function getDefaultValue(record, options, type) {
  let value;

  if (typeof options.defaultValue === 'function') {
    value = options.defaultValue();
  } else if ('defaultValue' in options) {
    value = options.defaultValue;
  } else if (type === 'array') {
    value = [];
  } else {
    return null;
  }

  assert(`The fragment's default value must be an ${type}`, (typeOf(value) == type) || (value === null));

  // Create a deep copy of the resulting value to avoid shared reference errors
  return copy(value, true);
}

// Returns the value of the property or the default propery
function getWithDefault(internalModel, key, options, type) {
  let data = internalModel._modelData.getAttr(key);
  if (data !== undefined) {
    return data;
  }
  return getDefaultValue(internalModel, options, type);
}

export {
  fragment,
  fragmentArray,
  array,
  fragmentOwner
};
