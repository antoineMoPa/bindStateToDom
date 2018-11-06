/**
   bindStateToDom
   
   Binds variables in `state` to given `element` and child nodes, based on 
   behavior defined in `components`.
   
   You may pass extra components types through options.
 */

function bindStateToDom(state, element, options){
  let components = {};

  components["INPUT"] = {
    domValueGetter: (el) => ( el.value ),
    domValueSetter: (el, newValue) => ( el.value = newValue )
  };
  
  components["P"] = {
    domValueGetter: (el) => ( el.innerText ),
    domValueSetter: (el, newValue) => ( el.innerText = newValue )
  };
  
  // Some components require the same api
  components["SPAN"] = components["P"];
  
  if(options){
    if(options.extraComponents){
      for(let i in options.extraComponents){
        components[i.toUpperCase()] = options.extraComponents[i];
      }
    }
  }
  
  // Add getters, setters and value to state
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

        state[i]._set = (subState) => {
          state[i]._updaters.map((fn) => fn(subState));
        };
        
        // Recurse within object
        prepareState(state[i]);
      } else {
        // Add getters, setters, updaters and move value to a property
        let value = state[i];

        state[i] = {};
        
        state[i]._get = () => ( state[i]._value_do_not_modify );
        state[i]._set = (newValue) => {
          state[i]._updaters.map((fn) => fn(newValue));
          state[i]._value_do_not_modify = newValue;
          // Call parent updaters
          state._set(state);
        };
        state[i]._value_do_not_modify = value;
      }
      
      // Updaters will be called upon setting value
      state[i]._updaters = [];
      
      state[i]._initialized = true;
    }
  };
  
  prepareState(state);
  
  let elements = element.querySelectorAll(":scope, [data-map-to]:not([data-map-to*=\\$])");
  
  let initMapTo = ((el) => {
    // Find path to object bla.bla
    // and transform to array ['bla', 'bla']
    let name = el.getAttribute("data-map-to").split(".");
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
    
    // This method will update the state on component change
    let domListener = (event) => {
      let newVal = el.domValueGetter(el);
      currentStateObject._set(newVal);
    };

    // Bind listener to common input events
    el.onchange = domListener;
    el.onkeyup = domListener;

    // Set DOM accessors
    if(typeof(components[el.nodeName]) != "undefined"){
      el.domValueGetter = components[el.nodeName].domValueGetter;
      el.domValueSetter = components[el.nodeName].domValueSetter;
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

  elements.forEach(initMapTo);
  // Initalize data-map-to for root node
  if(element.getAttribute("data-map-to") != null) {
    initMapTo(element);
  }
  
  // Enable for loops
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
      
      for(let i in currentStateObject) {
        // Skip our control variables
        if(i[0] == '_') {
          continue;
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

        // Replace $i by iterator value
        let nodes = domRow.querySelectorAll("[data-map-to*=\\$"+iterator+"]");
        
        let replaceAttributes = (node) => {
          let newAttribute = node.getAttribute("data-map-to");
          newAttribute = newAttribute.replace("$"+iterator, i);
          node.setAttribute("data-map-to", newAttribute);
        };

        nodes.forEach(replaceAttributes);

        // Replace iterator in root node
        if(domRow.getAttribute("data-map-to") != null){
          replaceAttributes(domRow);
        }

        bindStateToDom(state, domRow);
        container.appendChild(domRow);
      }
      
      // Hide original element
      el.style.display = "none";
      el.parentNode.insertBefore(container, el);
    }
  });
}

const state = {
  meal: {
    vegetable: "Potato",
    vegetableCount: 42,
    fruits: [
      "apple",
      "tomato",
      "orange"
    ]
  },
  lines_of_code: '?'
};

const extraComponents = {
  "potatoout": {
    domValueGetter: (el) => ( el.innerText ),
    domValueSetter: (el, newValue) => ( el.innerText = "🥔" + newValue + "🥔" )
  }
};

bindStateToDom(state, document.body, {extraComponents: extraComponents});
