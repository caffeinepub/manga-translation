import OutCall "http-outcalls/outcall";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Char "mo:core/Char";
import Iter "mo:core/Iter";

actor {
  public query ({ caller }) func ping() : async Text {
    "pong";
  };

  let apiKey = "AIzaSyDLuDZuG434Rb-DJTPwGPezax0B2RxQSyY";
  let baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/";
  let postHeaders = [
    {
      name = "Content-Type";
      value = "application/json";
    },
  ];

  public query ({ caller }) func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  func jsonEscape(text : Text) : Text {
    let chars = text.chars().toArray();
    var resultChars : [Char] = [];
    for (char in chars.values()) {
      resultChars := resultChars.concat(
        switch (char) {
          case ('\"') { [Char.fromNat32(0x5c), Char.fromNat32(0x22)] };
          case ('\\') { [Char.fromNat32(0x5c), Char.fromNat32(0x5c)] };
          case ('\n') { [Char.fromNat32(0x5c), Char.fromNat32(0x6e)] };
          case ('\t') { [Char.fromNat32(0x5c), Char.fromNat32(0x74)] };
          case ('\r') { [Char.fromNat32(0x5c), Char.fromNat32(0x72)] };
          case (_) { [char] };
        }
      );
    };
    Text.fromArray(resultChars);
  };

  func jsonUnescape(text : Text) : Text {
    func replace(text : Text, pattern : Text, replacement : Text) : Text {
      let textChars = text.chars().toArray();
      let patternChars = pattern.chars().toArray();
      let replacementChars = replacement.chars().toArray();
      let textSize = textChars.size();
      let patSize = patternChars.size();
      var i = 0;
      var resultChars = textChars.sliceToArray(0, 0);

      while (i < textSize) {
        if (i + patSize <= textSize and Text.fromArray(textChars.sliceToArray(i, i + patSize)) == pattern) {
          resultChars := resultChars.concat(replacementChars);
          i += patSize;
        } else {
          resultChars := resultChars.concat(textChars.sliceToArray(i, i + 1));
          i += 1;
        };
      };
      Text.fromArray(resultChars);
    };

    let replacedBackslash = replace(text, "\\\\", "\\");
    let replacedQuote = replace(replacedBackslash, "\\\"", "\"");
    let replacedNewline = replace(replacedQuote, "\\n", "\n");
    let replacedTab = replace(replacedNewline, "\\t", "\t");
    replace(replacedTab, "\\r", "\r");
  };

  public shared ({ caller }) func translateWithGemini(model : Text, prompt : Text) : async Text {
    let url = baseUrl # model # ":generateContent?key=" # apiKey;
    let jsonBody = "{ \"contents\": [ { \"parts\": [ { \"text\": \"" # jsonEscape(prompt) # "\" } ] } ] } ";

    let responseText = await OutCall.httpPostRequest(url, postHeaders, jsonBody, transform);
    if (responseText.size() <= 0) {
      return "ERROR: HTTP POST outcall failed for url: " # url # ". Empty response: " # debug_show (responseText);
    };

    let candidateSearch = "\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"";
    let closingPatterns = [ "\"}]}}],", "\"}]}},", "\"}]}}" ];
    switch (extractBetween(responseText, candidateSearch, closingPatterns)) {
      case (?extractedText) { jsonUnescape(extractedText) };
      case (_) { "ERROR: Unexpected response format: " # responseText };
    };
  };

  func extractBetween(text : Text, before : Text, afterPatterns : [Text]) : ?Text {
    let beforeIndex = switch (findFirstSubstring(text, before)) {
      case (?idx) { idx };
      case (null) { return null };
    };

    for (after in afterPatterns.values()) {
      switch (findFirstSubstring(text, after)) {
        case (?afterIndex) {
          let beforeEnd = Nat.min(afterIndex, after.size());
          if (beforeIndex < afterIndex and afterIndex <= text.size()) {
            let start = beforeIndex + before.size();
            let end = Nat.min(text.size(), beforeEnd);
            if (start < end) {
              let newArray = text.chars().toArray();
              let slice = newArray.sliceToArray(start, end);
              return ?Text.fromArray(slice);
            };
          };
        };
        case (null) {};
      };
    };
    null;
  };

  func findFirstSubstring(text : Text, substring : Text) : ?Nat {
    let textArray = text.chars().toArray();
    let subArray = substring.chars().toArray();

    func matchFromIndex(startIndex : Nat) : ?Nat {
      if (startIndex + subArray.size() > textArray.size()) {
        return null;
      };

      var i = 0;
      while (i < subArray.size()) {
        if (textArray[startIndex + i] != subArray[i]) {
          return null;
        };
        i += 1;
      };

      ?startIndex;
    };

    let maxIndex = if (textArray.size() > subArray.size()) { textArray.size() - subArray.size() } else { 0 };
    var i = 0;
    while (i <= maxIndex) {
      switch (matchFromIndex(i)) {
        case (?index) { return ?index };
        case (null) {};
      };
      i += 1;
    };
    null;
  };
};
