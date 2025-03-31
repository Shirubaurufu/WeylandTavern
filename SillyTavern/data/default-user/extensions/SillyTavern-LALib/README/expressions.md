# Expressions

Expressions can either be used standalone in the `/=` command, or in any command that uses boolean operations (e.g., `/ife`, `/filter`, `/whilee`, `/sorte`).  
Expressions provide a shorter and simpler way to build complex boolean evaluations. Additionally they allow basic arithmetic operations, as well as some shortcuts to get and set variable values.




## Values

Supported types of values are:
- booleans
- strings
- numbers
- variables
- macros


### Boolean Values

The basic boolean values `true` and `false` can either be typed in directly, or are the results of comparisons, logical operations, and negations.

```stscript
/= true |
/= false |
```


### Strings

Strings are delimited by single-quotes `'...'`.

```stscript
/= 'foo' |
```


### Numbers

Numbers use a dot as decimal separator.

```stscript
/= 100 |
/= -50 |
/= 1.23 |
```


### Variables

Variables are accessed by directly using their names. Precedence is as follows:
- scoped variables
- chat variables
- global variables

```stscript
/let x foo |
/= x | // evaluates to "foo" |
```

#### Dot Operator

If a variable can be evaluated to a list or dictionary, its items or properties can be accessed with the dot operator.

```stscript
/let x ["a", "b", "c"] |
/= x.0 | // evaluates to "a" |
/= x.-1 | // evaluates to "c" |
/= x.length | // evaluates to 3 |
/= x.0.length | // evaluates to 1 |

/let y {"a":1, "b":2, "c":3} |
/= y.a | // evaluates to 1 |

/let z {"a":1, "b":[1,2,3]} |
/= z.b.0 | // evaluates to 1 |
```

#### Spread-Dot Operator

The spread-dot operator can be used on a list to access a single property for all the list's items.

```stscript
/let x [
	{"a": 1, "b": "foo"},
	{"a": 2, "b": "ba"},
	{"a": 3, "b": "foobar"}
] |
/= x*.a | // evaluates to [1, 2, 3] |
/= x*.b | // evaluates to ["foo", "ba", "foobar"] |
/= x*.b*.length | // evaluates to [3, 2, 6] |
```


### Macros

Macros can be accessed with **single** curly braces.

```stscript
/= {char} | // evaluates to the value of {{char}} |
/= {lastMessageId} | // evaluates to the value of {{lastMessageId}} |
```



## Negations

A negation simply flips a boolean value; "not `true`" becomes `false`, "not `false`" becomes `true`.

```stscript
/= !true | // evaluates to false |
/= !false | // evaluates to true |
```



## Logical Operators

Logical operators combine two boolean values. Three logical operators are available (in order of precedence):
- `and`: true when both sides are true
- `or`: true when at least one side is true
- `xor`: true when only one side is true ("either or")

```stscript
/= true and true | // evaluates to true |
/= true and false | // evaluates to false |

/= true or true | // evaluates to true |
/= true or false | // evaluates to true |
/= false or false | // evaluates to false |

/= true xor true | // evaluates to false |
/= true xor false | // evaluates to true |
/= false xor false | // evaluates to false |
```



## Sub-Expressions

Parentheses `(...)` delimit sub-expressions. Whether to aid in readability, change precedence of evaluation, or group a part of an expression.

```stscript
/= !(true or false) | // evaluates to false |
/= !(true or false) and true | // evaluates to false |
```



## Comparison Operators

The following operations are available to compare two values.

- `a == b` - `a` equals `b`
- `a != b` - `a` does not equal `b`
- `a > b` - `a` is greater than `b`
- `a >= b` - `a` is greater than or equal to `b`
- `a < b` - `a` is less than `b`
- `a <= b` - `a` is less than or equal to `b`
- `a in b` - `a` is included in `b`
- `a not in b` - `a` is not included in `b`
- `a <=> b` - compare `a` with `b` (evaluates to 1/0/-1 if `a` is greater/equal/less than `b`)

```stscript
/= 1 == 2 | // evaluates to false |
/= 1 != 2 | // evaluates to true |
/= 1 > 1 | // evaluates to false |
/= 1 >= 1 | // evaluates to true |
/= 1 < 2 | // evaluates to true |
/= 2 <= 2 | // evaluates to true |

/= 2 in [1,2,3] | // evaluates to true |
/= 'oo' in 'foo' | // evaluates to true |
/= 4 not in [1,2,3] // evaluates to true |
/= 'oo' not in 'bar' | // evaluates to true |

/= 10 <=> 20 | // evaluates to -1 |
/= 5 <=> 5 | // evaluates to 0 |
/= 10 <=> 5 | // evaluates to 1 |
/= 'foo' <=> 'bar' | // evaluates to 1 |
/= 'bar' <=> 'foo' | // evaluates to -1 |
```


## Type Checks

Values can be checked for their types.

- strings
- numbers
- booleans
- lists
- dictionaries
- closures

```stscript
/= 'foo' is string | // evaluates to true |
/= 123 is number | // evaluates to true |
/= false is boolean | // evaluates to true |

/let x [1,2,3] |
/= x is list | // evaluates to true |

/let y {"a":1} |
/= y is dictionary | // evaluates to true |

/let z {: /echo foo :} |
/= z is closure | // evaluates to true |
```


## Regular Expressions

Comparison operations with strings can also be done against regular expressions. Regular expressions are delimited with singular forward slashes, with the flags following the closing slash (`/pattern/flags`).  
Pipes `|` must be escaped with a backslash `\|`. To match a literal pipe with a regular expression, it needs to be triple-escaped: `\\\|`.

```stscript
/= 'foo' == /oo$/ | // evaluates to true |
/= /foo\|bar/i in ["a", "b", "FOO"] | // evaluates to true |
/= /foo\|bar/i in ["a", "b", "bAr"] | // evaluates to true |
```


## Arithmetic Operators

The following arithmetic operators are supported:
- `a + b` - addition
- `a - b` - subtraction
- `a * b` - multiplication
- `a / b` - division
- `a // b` - integer division
- `a % b` - remainder (modulo)
- `a ** b` - power

```stscript
/= 1 + 1 | // evaluates to 2 |
/= 10 - 1 | // evaluates to 9 |
/= 2 * 5 | // evaluates to 10 |
/= 8 / 2 | // evaluates 4 |
/= 10 // 4 | // evaluates to 2 |
/= 3 % 2 | // evaluates to 1 |
/= 2**3 | // evaluates to 8 |
/= 25**(1/2) | // evaluates to 5 |
```


## Variable Assignments

The result of an expression can be directly assigned to a variable by adding an assignment at the beginning of the entire expression.  
If a variable with the given name already exists as a scoped, chat, or global variable, that one will be modified. Otherwise a scoped variable will be created.

The result of an assignment expression is the new variable value.

Assignment to list items or dictionary entries is supported via dot notation.

In addition to direct assignment, the basic arithmetic operations are supported as well and will operate on the current variable value.

- `a = b` - basic assignment
- `a += b` - add to current value
- `a -= b` - subtract from current value
- `a *= b` - multiply with current value
- `a /= b` - divide current value
- `a //= b` - integer-divide current value
- `a %= b` - divide current value, assign remainder
- `a **= b` - exponentiate current value

```stscript
/let x 2 |
/= x += 1 | // sets x to 3 |
/= x -= 2 | // sets x to 1 |
/= x *= 35 | // sets x to 35 |
/= x /= 3 | // sets x to 11 |
/= x //= 2 | // sets x to 5 |
/= x %= 2 | // sets x to 1 |
/= x ** 3 | // sets x to 8 |

/let y ["a", "b", "c"] |
/= y.0 = 'D' | // sets y to ["D", "b", "c"] |
/= y.1 += 'E' | // sets y to ["D", "bE", "c"] |

/let z [1, 2, 3] |
/= z.0 *= 5 | // sets z to [5, 2, 3] |
/= z.1 **= 3 | // sets z to [5, 8, 3] |
```


## Pre-/Post- Increment/Decrement

Increment and decrement operators (`++` and `--`) are supported, both in prefix and postfix notation.

- `++a` - increases a by 1, evaluates to the new value (after increase)
- `--a` - decreases a by 1, evaluates to the new value (after decrease)
- `a++` - increases a by 1, evaluates to the old value (before increase)
- `a--` - decreases a by 1, evaluates to the old value (before decrease)

```stscript
/let x 1 |
/= ++x | // sets x to 2, evaluates to 2 |
/= --x | // sets x to 1, evaluates to 1 |
/= x++ | // sets x to 2, evaluates to 1 |
/= x-- | // sets x to 1, evaluates to 2 |

/let y 0 |
/whilee (y++ < 3) {: /echo y: {{var::y}} :} | // shows 1, 2, 3 |

/let z 0 |
/whilee (++z < 3) {: /echo z: {{var::z}} :} | // shows 1, 2 |
```
