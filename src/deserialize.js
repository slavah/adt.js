  var 
    eatWhiteSpace = function(str) {
      for (var i = 0; i < str.length; ++i) {
        switch (str[i]) {
          case ' ':
          case '\n': 
          case '\r': 
          case '\t':  
            continue;
        }
        return str.slice(i);
      }
      return '';
    },

    lexString = function(str) {
      var i, searchIndex = 1;
      // pre-condition: str.length > 1
      while (true) {
        searchIndex = str.indexOf(str[0], searchIndex);
        if (searchIndex === -1)
          throw "No closing quotation mark was found for the string starting with " + str.slice(0, Math.min(5, str.length)) + "...";
        // Check if there's an odd number of escape characters before the quotation mark character
        for (i = searchIndex - 1; i > 0; --i)
          if (str[i] !== '\\') {
            if ((searchIndex - i) & 1 === 1) // There is an even number of slashes
              return { head: str.slice(0, searchIndex + 1), tail: str.slice(searchIndex + 1) };
            else // There is an odd number of slashes, so continue searching
              break;
          }
        searchIndex += 1;
      }
    },
    lex = function(str) {
      var 
        nextWhiteSpace,
        skip = 1;
      str = eatWhiteSpace(str);
      if (str.length === 0)
        return ['','']; // empty string
      switch (str[0]) {
        case '(':
        case ')':
        case '[':
        case ']':
        case ',': 
          return { head: str[0], tail: str.slice(1) };
        case '\"': 
        case '\'':
          return lexString(str);
        case '\\':
          skip = 2;
      }
      for (var i = skip; i < str.length; ++i) {
        switch (str[i]) {
          case '(':
          case ')':
          case '[':
          case ']':
          case ',':
          case ' ':
          case '\n':
          case '\r':
          case '\t':
            return { head: str.slice(0, i), tail: str.slice(i) };
          case '\"': 
          case '\'':
            throw "Illegal quote character `" + str[i] + "` found in lexeme. Quotes should be escaped using `\\" + str[i] + "`."
          case '\\':
            if (i === str.length - 1)
              throw "Escape character `\\` found at the end of the input string, followed by nothing."
            ++i; // skip the next character
        }
      }
      return { head: str, tail: "" };
    },
    parseADTTail = function(head, input) {
      var
        tag = unescapeString(head),
        tail = input,
        args = [];
      
      while (tail.length > 0)
        switch (tail[0]) {
          // Look ahead for terminating characters
          case ')':
          case ']':
          case ',':
            return { result: construct(tag, args), tail: tail };
          default:
            var parseResult = parseArgument(tail);
            if (parseResult == null)
              continue;
            args.push(parseResult.result);
            tail = parseResult.tail;
        }
      return { result: construct(tag, args), tail: tail };
    },
    parseArrayTail = function(input) {
      if (input.length < 2)
        throw "No data supplied after array opening bracket `[`.";
      var 
        tail = input,
        commaCount = 0,
        array = [];
      while (tail.length > 0)
        switch (tail[0]) {
          case ')':
            throw "Invalid character `" + tail[0] + "` found in the data."
          case ',':
            ++commaCount;
            if (commaCount < array.length)
              array.push(undefined);
            // post-condition: array.length === commaCount
            tail = tail.slice(1);
            continue;
          case ']':
            return { result: array, tail: tail.slice(1) };
          default:
            if (commaCount < array.length)
              throw "Expected `,` separator between array elements."
            var parseResult = parse(tail);
            if (parseResult == null)
              continue;
            array.push(parseResult.result);
            tail = parseResult.tail;
        }
      throw "Could not find the closing bracket for the array `[" + input.slice(0, Math.max(input.length,4)).join('') + "...`";
      // TODO...
      //return tail;
    },
    parseParensTail = function(input) {
      if (input.length < 1)
        throw "No data after opening parenthesis.";
      var head = input[0], tail = input.slice(1);
      if (head.length === 0)
        return parseParensTail(tail); // no argument (two whitespace characters next to each other causes this)
      switch (head) {
        case '(':
          throw "Invalid double opening parentheses `((` found."
        case ')':
          throw "No data supplied after opening parenthesis `(`. The unit type, (), is not supported.";
        case '[':
        case ']':
        case ',':
        case '\"':
        case '\'':
          // Note that primitives are not allowed inside `(...)`
          throw "Invalid character `" + head + "` found after opening parenthesis."
      }
      // Parse the ADT constructor and arguments
      var parseResult = parseADTTail(head, tail);
      if (parseResult.tail.length === 0 || parseResult.tail[0] !== ')')
        throw "Could not find the closing parenthesis for the data `(" + input.slice(0, Math.max(input.length,4)).join(' ') + "...`";
      return { result: parseResult.result, tail: parseResult.tail.slice(1) };
    },
    parsePrimitive = function(head, input) {
      switch (head) {
        case '(':
          return parseParensTail(input);
        case '[':
          return parseArrayTail(input);
      }
      switch (head[0]) {
        case '\"':
          //pre-condition: head[head.length - 1] === '\"'
          //pre-condition: head.length > 1
          return { result: unescapeString(head.slice(1, head.length - 1)), tail: input };
        case '\'':
          //pre-condition: head[head.length - 1] === '\"'
          //pre-condition: head.length > 1
          return { result: unescapeString(head.slice(1, head.length - 1)), tail: input };
      }
      var numberCast = Number(head);
      if (!isNaN(numberCast))
        return { result: numberCast, tail: input };
      return null;
    },
    parseArgument = function(input) {
      // This is almost identical to parse, except it only allows argumentless ADT constructors
      if (input.length == 0)
        return null;
      // pre-condition: input.length > 0
      var head = input[0], tail = input.slice(1);
      if (head.length === 0)
        return parseArgument(tail); // no argument (two whitespace characters next to each other causes this)
      // Try to parse a primitive from the stream
      var parseResult = parsePrimitive(head, tail);
      if (parseResult != null)
        return parseResult;
      // The next token is not a primitive type, so it must be a constructor tag
      var tag = unescapeString(head);
      return { result: construct(tag, []), tail: tail };
    },
    parse = function(input) {
      if (input.length == 0)
        return null;
      var head = input[0], tail = input.slice(1);
      if (head.length === 0)
        return parse(tail); // no argument (two whitespace characters next to each other causes this)
      // Try to parse a primitive from the stream
      var parseResult = parsePrimitive(head, tail);
      if (parseResult != null)
        return parseResult;
      // The next token is not a primitive type, so it must be a constructor tag
      return parseADTTail(head, tail);
    };
  adt.deserialize = function(str){
    var
      lexemes = [],
      lexState = { head: '', tail: str },
      stack = [];
    while (lexState.tail.length > 0) {
      lexState = lex(lexState.tail);
      lexemes.push(lexState.head);
    }
    // Remove all empty lexemes from the start of the array
    while (lexemes.length > 0 && lexemes[0].length == 0)
      lexemes = lexemes.slice(1);
    // Test whether the list of lexemes is empty (the string was empty or whitespace only)
    if (lexemes.length == 0)
      return;
    // Allow lisp style constructors with starting and ending parentheses
    if (lexemes[0] === '(')
      if (lexemes[lexemes.length - 1] !== ')') {
        lexemesStr = lexemes.join(' ');
        throw "Optional opening parenthesis used for the data " + lexemesStr.slice(0, Math.min(10, lexemesStr.length)) + "... but could not find the closing parenthesis.";
      }
    return parse(lexemes).result;
    // post-condition: parse(lexemes) != null (because all empty lexemes at the beginning were explicitly removed)
    // post-condition: parse(lexemes).tail.length === 0
  };
//*/



/*
  var 
    lexADT()
  adt.deserialize = function(str) {
    var
      head,
      tail,
      result;
    if (lexemes.length === 0)
      return;

    head = lexemes[0];
    tail = lexemes.slice(1);
    result = deserializeWithKey(0, head, tail);
    // post-condition: result[1].length === 0
    return result[0];
  };
*/
