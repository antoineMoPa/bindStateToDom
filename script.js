/**
   bindStateToDom
   
   Binds variables in `state` to given `element` and child nodes, based on 
   behavior defined in `components`.
   
   You may pass extra components types through options.
 */

function bindStateToDom(state, element, options){
  let components = {};

  /*
     Gets path to object bla.bla in node attribute
     and transform to array ['bla', 'bla']
     Replaces any found alias (ex $i -> 0)
     
     Returns false if some aliases can't be resolved
  */
  let replaceAliases = (attribute, node) => {
    let name = node.getAttribute(attribute).split(".");
    
    // Replace aliases, such as iterators
    for(let i = 0; i < name.length; i++) {
      if(name[i][0] == '$'){
        // Name starts with $, so it is a variable
        // Take the rest of the string as it is the variable name
        let variable = name[i].substr(1);
        let value = node.getAttribute("data-alias-" + variable);
        
        if(value == null) {
          // No alias found
          return false;
        }
        name[i] = value;
      }
    }
    
    return name;
  };

  // Some default components
  components["INPUT"] = {
    domValueGetter: (el) => ( el.value ),
    domValueSetter: (el, newValue) => ( el.value = newValue )
  };
  
  components["P"] = {
    domValueGetter: (el) => ( el.innerText ),
    domValueSetter: (el, newValue) => ( el.innerText = newValue )
  };

  components["APPEND-BUTTON"] = {
    domClick: (el, state, subState) => {
      /* 
        Here we choose to add null because it works with both
        number and text inputs.
        You could choose to add a parameter data-default-value
        Or data-default-json for arrays of objects
        To do this, you can override this component or create a new tag
      */
      var name = replaceAliases("data-map-to", el);
      subState._append(null, "");
    }
  };

  components["DELETE-BUTTON"] = {
    domClick: (el, state) => {
      var name = replaceAliases("data-map-to", el);
      state._delete(name[name.length-1]);
    }
  };
  
  // Some components require the same api
  components["SPAN"] = components["P"];

  // Load user components
  if(options){
    if(options.extraComponents){
      for(let i in options.extraComponents){
        components[i.toUpperCase()] = options.extraComponents[i];
      }
    }
  }
  
  /*
    Add getters, setters, updaters and value to state
  */
  let prepareState = (state) => {
    for(let i in state){
      if(typeof(state[i]._initialized) != "undefined"){
        continue;
      }
      
      // Skip our defined properties
      if (i[0] == '_') {
        continue;
      }

      if (typeof(state[i]) === "object") {
        // Note: arrays are also objects

        
        // This method is called when a child is updated
        // So we can perform actions when a part of a subTree is updated
        state[i]._set = (subState) => {
          state[i]._updaters.map((fn) => fn(subState));
        };
        
        // We need to keep the pointer for some callbacks
        let state_i = state[i];
        
        // This method can be used to safely delete an element
        state[i]._delete = (item) => {
          item = parseInt(item);
          // Call dom deleter for item if it exists
          state_i[item]._domDeleters.map( (fn) => fn(item) );
          
          state_i.splice(item, 1);
        };

        // This will keep a list of functions to call
        // When adding elements to an array
        state[i]._domAppenders = [];
        
        /*
          This method can be used to add an `value` at the end
          of an array, updating the dom.
          
          if item is null, the row is pushed at the end
          else, we insert at position `item`
          
          if value is undefined, we assume index was null
          and use `index` as value that we push at the end of array
        */
        state[i]._append = (index, value) => {
          if(typeof(value) == "undefined"){
            value = index;
            index = null;
          }
          
          if(index == null){
            // Append at end if no position was given
            state[i].push(value);
            index = state[i].length - 1;
          } else {
            index = parseInt(index);
            state[i].splice(index, 0, value);
          }
          
          // Prepare added part of state
          prepareState(state[i]);

          // Call functions that create the dom elements
          state[i]._domAppenders.map( (fn) => fn(state_i, index) );
          // Call updaters of parent object
          state[i]._set();
          
        };
        
        // Recurse within object
        prepareState(state[i]);
      } else {
        // Add getters, setters, updaters and move value to a property
        let value = state[i];

        state[i] = {};
        // This will keep a list of functions to call
        // When deleting an object
        state[i]._domDeleters = [];
        let state_i = state[i];
        // The access point to modify and get values
        state[i]._get = () => ( state[i]._value_do_not_modify );
        state[i]._set = (newValue) => {
          state_i._updaters.map((fn) => fn(newValue));
          state_i._value_do_not_modify = newValue;
          // Call parent updaters
          state._set(state);
        };
        // This is where we store the state
        // Updating it directly will just mess stuff
        state[i]._value_do_not_modify = value;
      }
      
      // Updaters will be called upon setting value
      state[i]._updaters = [];

      // Mark this element as done
      state[i]._initialized = true;
    }
  };
  
  prepareState(state);
  
  /*
     Look for data-map-to in dom and bind it
  */
  let elements = element.querySelectorAll(":scope, [data-map-to]");
  let initMapTo = ((el) => {
    let name = replaceAliases("data-map-to", el);
    
    if(name === false){
      // Element contains a variable that has not been set yet.
      // Most of the time, this is a loop element template
      // We could potentially detect if rendering should be finished
      // And throw an error, if lot's of bug end up here.
      return;
    }

    let currentStateObject = null;
    let objCursor = state;
    
    // Navigate with a cursor objCursor
    // to the right state element
    for(var i = 0; i < name.length - 1; i++) {
      objCursor = objCursor[name[i]];
    }

    let parentObject = objCursor;
    currentStateObject = objCursor[name[i]];

    if(typeof(currentStateObject) == "undefined") {
      console.error("Variable '" + name.join('.') + "' not found in state");
      return;
    }
    
    // This method will update the state on component change
    let domListener = (event) => {
      let newVal = el.domValueGetter(el);
      currentStateObject._set(newVal);
    };

    // This method will update the state on component change
    let clickListener = (event) => {
      let newVal = el.domClick(el, parentObject, currentStateObject);
    };
    
    // Bind listener to common input events
    el.onchange = domListener;
    el.onkeyup = domListener;
    el.onclick = clickListener;
    
    // Set DOM accessors
    if(typeof(components[el.nodeName]) != "undefined"){
      let nullAction = () => {};
      // Bind method found in appropriate component
      el.domValueGetter = components[el.nodeName].domValueGetter || nullAction;
      el.domValueSetter = components[el.nodeName].domValueSetter || nullAction;
      el.domClick = components[el.nodeName].domClick || nullAction;
    } else {
      console.error("No component defined for '"+el.nodeName+"'");
    }

    // This method will update the component on state change
    currentStateObject._updaters.push((newVal) => {
      el.domValueSetter(el, newVal);
    });
    
    // If a default non-null value was specified
    if(currentStateObject._value_do_not_modify != null) {
      // Initialize to default state value
      el.domValueSetter(el, currentStateObject._value_do_not_modify);
    }
  });

  // Initalize data-map-to for root node and sub nodes
  elements.forEach(initMapTo);
  if(element.getAttribute("data-map-to") != null) {
    initMapTo(element);
  }
  
  /*
    Initialize loops
  */
  let loops = element.querySelectorAll("[data-loop]");
  loops.forEach((el) => {
    // Split argument
    let loopParts = el.getAttribute("data-loop").split(" in ");

    // With data-loop="i in meal.fruits", iterator is i
    let iterator = loopParts[0];
    
    // Find path to object bla.bla
    // and transform to array ['bla', 'bla']
    let name = loopParts[1].split(".");
    
    let currentStateObject = null;
    let objCursor = state;
    
    // Navigate with a cursor objCursor
    // to the right state element
    for(var i = 0; i < name.length - 1; i++) {
      objCursor = objCursor[name[i]];
    }
    
    currentStateObject = objCursor[name[i]];

    if(typeof(currentStateObject) == "undefined") {
      console.error("Variable '" + name.join('.') + "' not found in state");
      return;
    }

    if(Array.isArray(currentStateObject)){
      let container = document.createElement(el.nodeName);

      let increaseAfter = (parent, index, amount) => {
        // Increment next iterators
        // Replace $i by iterator value
        let nodes = parent.querySelectorAll("[data-map-to*=\\$"+iterator+"]");
        
        // Increment aliases when appending
        let replaceAttributes = (node) => {
          let value = parseInt(node.getAttribute("data-alias-" + iterator));
          if(value >= index){
            node.setAttribute("data-alias-"+iterator, value + amount);
          }
        };

        nodes.forEach(replaceAttributes);
      };
      
      let domAppender = (currentStateObject, i) => {
        // Skip our control variables
        if(i[0] == '_') {
          return;
        }

        let domRow = document.createElement(el.nodeName);
        // Clone content
        domRow.innerHTML = el.innerHTML;
        
          
        // Copy all attributes (classes, styles) to rows
        for(let attribute of el.getAttributeNames()){
          // ( Except attribute data-loop )
          if(attribute != "data-loop"){
            domRow.setAttribute(attribute, el.getAttribute(attribute));
          }
        }

        // The template was hidden, but we want our node to be shown
        domRow.style.display = null;
        
        // Replace $i by iterator value
        let nodes = domRow.querySelectorAll("[data-map-to*=\\$"+iterator+"]");
        
        let replaceAttributes = (node) => {
          node.setAttribute("data-alias-"+iterator, i);
        };
        
        // Change aliases for each sub nodes
        nodes.forEach(replaceAttributes);
        
        // Perform deletion
        currentStateObject[i]._domDeleters.push((item) => {
          // Decrement next iterators
          increaseAfter(domRow.parentNode, item + 1, -1);
          domRow.parentNode.removeChild(domRow);
        });
        
        // Replace iterator in root node
        if(domRow.getAttribute("data-map-to") != null){
          replaceAttributes(domRow);
        }

        // Link new element to state
        bindStateToDom(state, domRow);
        
        // Actually append the dom to container
        if(i == container.children.length) {
          // Add at the end
          container.appendChild(domRow);
        } else {
          increaseAfter(container, i, 1);
          container.insertBefore(domRow, container.children[i]);
        }
      };

      // Append all objects already in state
      for(let i in currentStateObject) {
        domAppender(currentStateObject, i);
      }
      
      // Elements created after page load will also use the domAppender
      currentStateObject._domAppenders.push(domAppender);

      // Hide original element
      el.style.display = "none";
      el.parentNode.insertBefore(container, el);
    }
  });
}
