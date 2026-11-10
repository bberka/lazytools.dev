import { test, expect } from '@playwright/test';
import {
  beautifyCss,
  byteLength,
  minifyCss,
  shortenNumber,
  sizeChange,
} from '@/lib/tools/css-formatter';

const min = (css: string, keepImportantComments = false) => minifyCss(css, { keepImportantComments }).output;

test.describe('minifyCss basics', () => {
  test('strips comments, whitespace and the last semicolon', () => {
    expect(min('/* header */\na {\n  color : red ;\n  margin : 0 auto ;\n}\n\n/* end */')).toBe(
      'a{color:red;margin:0 auto}'
    );
  });

  test('empty and comment-only input give nothing', () => {
    expect(min('')).toBe('');
    expect(min('   \n\t ')).toBe('');
    expect(min('/* only a comment */')).toBe('');
  });

  test('drops empty style rules but keeps empty at-rules such as @layer', () => {
    expect(min('.a{} .b{color:red} .c{ /* nothing */ }')).toBe('.b{color:red}');
    expect(min('@layer base{}')).toBe('@layer base{}');
    expect(min('@media print{.a{}}')).toBe('@media print{}');
  });

  test('empty statements and doubled semicolons are removed', () => {
    expect(min('a{color:red;;;margin:0;}')).toBe('a{color:red;margin:0}');
  });

  test('is idempotent', () => {
    const css = `
      @media (min-width: 600px) { a, b > c { margin: 0.50em 0 } }
      .x::before { content: "a  b"; background: url( x.png ) }
    `;
    const once = min(css);
    expect(min(once)).toBe(once);
  });
});

test.describe('minifyCss keeps strings, urls and comments inside them intact', () => {
  test('a string with comment markers, braces, semicolons and double spaces', () => {
    expect(min('a::after{content:"a  /* not a comment */ ; } b"}')).toBe(
      'a::after{content:"a  /* not a comment */ ; } b"}'
    );
    expect(min("a::after{content:'it\\'s  {x}'}")).toBe("a::after{content:'it\\'s  {x}'}");
    expect(min('a::after{content:"say \\"hi\\" ;  }"}')).toBe('a::after{content:"say \\"hi\\" ;  }"}');
  });

  test('comment markers in a url are not comments', () => {
    expect(min('a{background:url(http://x.com/a//*b*/c.png)}')).toBe('a{background:url(http://x.com/a//*b*/c.png)}');
    expect(min('a{background:url( "a b;c.png" )}')).toBe('a{background:url("a b;c.png")}');
  });

  test('unquoted urls keep their content, with semicolons, commas and spaces trimmed only at the ends', () => {
    expect(min('a{background:url(  data:image/png;base64,iVBOR/+w==  ) no-repeat , url(b.png)}')).toBe(
      'a{background:url(data:image/png;base64,iVBOR/+w==) no-repeat,url(b.png)}'
    );
    expect(min('a{b:url(x\\)y.png)}')).toBe('a{b:url(x\\)y.png)}');
  });

  test('a string in an attribute selector and in @import', () => {
    expect(min('a[data-x = "a  b,c"] , b {c:d}')).toBe('a[data-x="a  b,c"],b{c:d}');
    expect(min('@import "a;b.css"  screen ;')).toBe('@import "a;b.css" screen');
    expect(min('@charset "utf-8";a{b:c}')).toBe('@charset "utf-8";a{b:c}');
  });

  test('a comment next to a string is removed, the string is not touched', () => {
    expect(min('a{content:/* x */"/* y */"/* z */}')).toBe('a{content:"/* y */"}');
  });

  test('a comment between two words still separates them', () => {
    expect(min('a{margin:1px/**/2px}')).toBe('a{margin:1px 2px}');
    expect(min('a/**/b{c:d}')).toBe('a b{c:d}');
  });
});

test.describe('minifyCss keeps the spacing CSS needs', () => {
  test('calc keeps the spaces around + and -', () => {
    expect(min('a{width:calc( 100% - ( 2 * var( --gap , 4px ) ) )}')).toBe('a{width:calc(100% - (2 * var(--gap,4px)))}');
    expect(min('a{width:calc(1px + 2px)}')).toBe('a{width:calc(1px + 2px)}');
    expect(min('a{width:calc(-1 * 0.50px)}')).toBe('a{width:calc(-1 * .5px)}');
  });

  test('a unit-less 0px is not shortened, because calc(0px + 1em) needs the unit', () => {
    expect(min('a{margin:0px;width:calc(0px + 1em)}')).toBe('a{margin:0px;width:calc(0px + 1em)}');
  });

  test('descendant combinators and pseudo-class spaces survive', () => {
    expect(min('a  b ,  a :hover , a:hover {c:d}')).toBe('a b,a :hover,a:hover{c:d}');
    expect(min(':is(.a, .b) .c , ul li:not( .x ) {c:d}')).toBe(':is(.a,.b) .c,ul li:not(.x){c:d}');
    expect(min('a [href] {c:d}')).toBe('a [href]{c:d}');
    expect(min('* html .a * {c:d}')).toBe('* html .a *{c:d}');
  });

  test('child, sibling and nth-child expressions', () => {
    expect(min('a > b + c ~ d {e:f}')).toBe('a>b+c~d{e:f}');
    expect(min('li:nth-child( 2n + 1 ) {a:b}')).toBe('li:nth-child(2n+1){a:b}');
    expect(min('li:nth-child( 2n - 1 ) {a:b}')).toBe('li:nth-child(2n - 1){a:b}');
    expect(min('a { & > b , &.c , .d & {e:f} }')).toBe('a{&>b,&.c,.d &{e:f}}');
  });

  test('values that are space separated stay separated', () => {
    expect(min('a{margin:0   auto  0 -1px;font:italic 12px / 1.5 "A B" , serif}')).toBe(
      'a{margin:0 auto 0 -1px;font:italic 12px / 1.5 "A B",serif}'
    );
    expect(min('a{transition:opacity .3s ease , transform .3s ease}')).toBe('a{transition:opacity .3s ease,transform .3s ease}');
  });

  test('!important loses its spaces', () => {
    expect(min('a{color:red ! important;margin:0!important}')).toBe('a{color:red!important;margin:0!important}');
  });

  test('custom property values only have their whitespace collapsed', () => {
    expect(min(':root{--shadow:  0 0 1px   red , 0 0 2px blue ;--n: 0.50; --c: #aabbcc ;--e: ;}')).toBe(
      ':root{--shadow:0 0 1px red , 0 0 2px blue;--n:0.50;--c:#aabbcc;--e: }'
    );
    expect(min(':root{--obj: { a : b }}')).toBe(':root{--obj:{ a : b }}');
  });

  test('keeps a space between a word and an adjacent url or function', () => {
    expect(min('@font-face{src:url(a.woff2) format("woff2") , url(a.woff) format("woff")}')).toBe(
      '@font-face{src:url(a.woff2) format("woff2"),url(a.woff) format("woff")}'
    );
  });
});

test.describe('minifyCss shortens numbers and colours only where that is safe', () => {
  test('shortenNumber', () => {
    expect(shortenNumber('0.5')).toBe('.5');
    expect(shortenNumber('0.50em')).toBe('.5em');
    expect(shortenNumber('00.5')).toBe('.5');
    expect(shortenNumber('1.0')).toBe('1');
    expect(shortenNumber('1.50')).toBe('1.5');
    expect(shortenNumber('0.0')).toBe('0');
    expect(shortenNumber('0.00px')).toBe('0px');
    expect(shortenNumber('100.00%')).toBe('100%');
    expect(shortenNumber('-0.25')).toBe('-.25');
    expect(shortenNumber('+0.25s')).toBe('+.25s');
    expect(shortenNumber('10')).toBe('10');
    expect(shortenNumber('007')).toBe('7');
    expect(shortenNumber('0')).toBe('0');
    expect(shortenNumber('1e3')).toBe('1e3');
    expect(shortenNumber('1.50e3')).toBe('1.50e3');
    expect(shortenNumber('1em')).toBe('1em');
    expect(shortenNumber('2.0em')).toBe('2em');
  });

  test('numbers in declarations', () => {
    expect(min('a{opacity:0.50;line-height:1.0;margin:-0.5em 0.0;width:50.0%;transition:all 0.30s}')).toBe(
      'a{opacity:.5;line-height:1;margin:-.5em 0;width:50%;transition:all .3s}'
    );
  });

  test('numbers in selectors, strings and urls are left alone', () => {
    expect(min('.col-0.5 , h1.a {b:c}')).toBe('.col-0.5,h1.a{b:c}');
    expect(min('a{content:"0.50";background:url(0.50.png)}')).toBe('a{content:"0.50";background:url(0.50.png)}');
    expect(min('@keyframes k{0.0%{a:b}50.5%{a:c}}')).toBe('@keyframes k{0.0%{a:b}50.5%{a:c}}');
  });

  test('unicode-range is not touched', () => {
    expect(min('@font-face{unicode-range:U+0025-00FF , U+0000-0010 , u+4??}')).toBe(
      '@font-face{unicode-range:U+0025-00FF,U+0000-0010,u+4??}'
    );
  });

  test('hex colours with repeated pairs are shortened, others are not', () => {
    expect(min('a{color:#ffffff;background:#AABBCC;border-color:#aabbccdd;outline-color:#12345a}')).toBe(
      'a{color:#fff;background:#ABC;border-color:#abcd;outline-color:#12345a}'
    );
  });

  test('hex-like words that are not colours are not shortened', () => {
    expect(min('a{background:url(#aabbcc);content:"#aabbcc"}')).toBe('a{background:url(#aabbcc);content:"#aabbcc"}');
    expect(min('#aabbcc , #112233 .x {a:b}')).toBe('#aabbcc,#112233 .x{a:b}');
  });

  test('IE progid filters keep their 8-digit colours', () => {
    expect(min('a{filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=#00000000,endColorstr=#ffffffff)}')).toBe(
      'a{filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=#00000000,endColorstr=#ffffffff)}'
    );
  });
});

test.describe('minifyCss with at-rules and nesting', () => {
  test('@media, @supports, @container prelude spacing', () => {
    expect(min('@media screen and ( min-width : 600px ) and (max-width: 900px) { a{b:c} }')).toBe(
      '@media screen and (min-width:600px) and (max-width:900px){a{b:c}}'
    );
    expect(min('@media(min-width:600px){a{b:c}}')).toBe('@media(min-width:600px){a{b:c}}');
    expect(min('@supports (display: grid) and (not (display: inline-grid)) { a{display:grid} }')).toBe(
      '@supports (display:grid) and (not (display:inline-grid)){a{display:grid}}'
    );
    expect(min('@container sidebar (min-width: 400px) { a{b:c} }')).toBe('@container sidebar (min-width:400px){a{b:c}}');
  });

  test('functions in preludes keep their colon spacing', () => {
    expect(min('@supports selector( a:hover ) { a{b:c} }')).toBe('@supports selector(a:hover){a{b:c}}');
    expect(min('@page :first { margin: 0 }')).toBe('@page :first{margin:0}');
  });

  test('@layer lists, @import and @keyframes', () => {
    expect(min('@layer reset , base , theme ;')).toBe('@layer reset,base,theme');
    expect(min('@keyframes spin { from { transform : rotate( 0deg ) } to { transform : rotate( 360deg ) } }')).toBe(
      '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
    );
    expect(min('@keyframes k{0%,100%{a:b}50%{a:c}}')).toBe('@keyframes k{0%,100%{a:b}50%{a:c}}');
  });

  test('@font-face with url followed directly by format', () => {
    expect(min('@font-face{font-family:"X";src:url(x.woff2)format("woff2")}')).toBe(
      '@font-face{font-family:"X";src:url(x.woff2)format("woff2")}'
    );
  });

  test('modern CSS nesting with declarations before and after nested rules', () => {
    expect(
      min(`
        .card {
          color: red;
          &:hover { color: blue; }
          .title { font-weight: bold }
          @media (min-width: 600px) { padding: 1rem; & .x { margin: 0 } }
          margin: 0;
        }
      `)
    ).toBe('.card{color:red;&:hover{color:blue}.title{font-weight:bold}@media (min-width:600px){padding:1rem;& .x{margin:0}}margin:0}');
  });

  test('semicolons are kept between statements and only dropped at the very end', () => {
    expect(min('@import "a.css"; @import "b.css"; a{b:c}')).toBe('@import "a.css";@import "b.css";a{b:c}');
    expect(min('a{b:c} @import "z.css";')).toBe('a{b:c}@import "z.css"');
  });

  test('old hacks survive', () => {
    expect(min('a{*zoom:1;_height:1px;color:red\\9}')).toBe('a{*zoom:1;_height:1px;color:red\\9}');
  });
});

test.describe('minifyCss comments option', () => {
  test('/*! comments are kept on request', () => {
    const css = '/*! MIT License */\n/* drop me */\na { b : c }';
    expect(min(css)).toBe('a{b:c}');
    expect(min(css, true)).toBe('/*! MIT License */a{b:c}');
  });
});

test.describe('warnings', () => {
  test('a stray closing brace', () => {
    const result = minifyCss('a{b:c}\n}\nd{e:f}');
    expect(result.output).toBe('a{b:c}d{e:f}');
    expect(result.warnings).toEqual(['Unexpected "}" on line 2']);
  });

  test('an unclosed block is closed in the output', () => {
    const result = minifyCss('a{b:c;\nd{e:f');
    expect(result.output).toBe('a{b:c;d{e:f}}');
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('Missing closing "}"');
  });

  test('an unterminated comment, string and url', () => {
    expect(minifyCss('a{b:c} /* open').warnings).toEqual(['Unterminated comment starting on line 1']);
    expect(minifyCss('a{content:"open\n}b{c:d}').warnings).toEqual(['Unterminated string on line 1']);
    expect(minifyCss('a{b:url(open').warnings[0]).toBe('Unterminated url( on line 1');
  });

  test('valid input has no warnings', () => {
    expect(minifyCss('a{b:c}').warnings).toEqual([]);
    expect(beautifyCss('a{b:c}').warnings).toEqual([]);
  });
});

test.describe('beautifyCss', () => {
  test('one declaration per line, two-space indent, blank line between blocks', () => {
    expect(beautifyCss('a{color:red;margin:0 auto}b,c>d{x:y}').output).toBe(
      'a {\n  color: red;\n  margin: 0 auto;\n}\n\nb,\nc > d {\n  x: y;\n}\n'
    );
  });

  test('indent choices', () => {
    const css = '@media print{a{b:c}}';
    expect(beautifyCss(css, { indent: 2 }).output).toBe('@media print {\n  a {\n    b: c;\n  }\n}\n');
    expect(beautifyCss(css, { indent: 4 }).output).toBe('@media print {\n    a {\n        b: c;\n    }\n}\n');
    expect(beautifyCss(css, { indent: 'tab' }).output).toBe('@media print {\n\ta {\n\t\tb: c;\n\t}\n}\n');
  });

  test('spaces after commas and colons, not inside strings', () => {
    expect(beautifyCss('a{font:12px/1.5 "A,B",serif;color:rgba(0,0,0,.5);background:url(a,b.png)}').output).toBe(
      'a {\n  font: 12px/1.5 "A,B", serif;\n  color: rgba(0, 0, 0, .5);\n  background: url(a,b.png);\n}\n'
    );
  });

  test('selector combinators get spaces, nth-child arguments and attributes do not', () => {
    expect(beautifyCss('a>b+c~d,li:nth-child(2n+1),a[href^="x"]{e:f}').output).toBe(
      'a > b + c ~ d,\nli:nth-child(2n+1),\na[href^="x"] {\n  e: f;\n}\n'
    );
  });

  test('!important, empty rules and numbers stay as written', () => {
    expect(beautifyCss('a{color:red!important;opacity:0.50}.e{}').output).toBe(
      'a {\n  color: red !important;\n  opacity: 0.50;\n}\n\n.e {\n}\n'
    );
  });

  test('@media and @supports preludes', () => {
    expect(beautifyCss('@media screen and (min-width:600px) and (max-width:900px){a{b:c}}').output).toBe(
      '@media screen and (min-width: 600px) and (max-width: 900px) {\n  a {\n    b: c;\n  }\n}\n'
    );
    expect(beautifyCss('@supports selector(a:hover){a{b:c}}').output).toContain('@supports selector(a:hover) {');
    expect(beautifyCss('@media(min-width:600px){a{b:c}}').output).toContain('@media (min-width: 600px) {');
  });

  test('nested rules, @media inside a rule and declarations after a nested rule', () => {
    expect(beautifyCss('.a{color:red;&:hover{color:blue}@media (width>=600px){padding:1rem}margin:0}').output).toBe(
      [
        '.a {',
        '  color: red;',
        '  &:hover {',
        '    color: blue;',
        '  }',
        '',
        '  @media (width>=600px) {',
        '    padding: 1rem;',
        '  }',
        '',
        '  margin: 0;',
        '}',
        '',
      ].join('\n')
    );
  });

  test('comments are kept at statement level and inside values', () => {
    expect(beautifyCss('/* top */a{/* in */b:c /* after */;d:e}').output).toBe(
      '/* top */\na {\n  /* in */\n  b: c /* after */;\n  d: e;\n}\n'
    );
  });

  test('strings and urls with special characters are untouched', () => {
    expect(beautifyCss('a::after{content:"}{;  /*x*/";background:url(data:image/svg+xml;utf8,<svg/>)}').output).toBe(
      'a::after {\n  content: "}{;  /*x*/";\n  background: url(data:image/svg+xml;utf8,<svg/>);\n}\n'
    );
  });

  test('@keyframes with a selector list', () => {
    expect(beautifyCss('@keyframes k{0%,100%{a:b}50%{a:c}}').output).toBe(
      '@keyframes k {\n  0%,\n  100% {\n    a: b;\n  }\n\n  50% {\n    a: c;\n  }\n}\n'
    );
  });

  test('beautify then minify equals minify', () => {
    const css = `@media (min-width: 600px){.a>b,.c{margin:0.50em 0;background:url( x.png ) no-repeat}}a:hover{color:#ffffff}`;
    expect(min(beautifyCss(css).output)).toBe(min(css));
    expect(min(beautifyCss(css, { indent: 'tab' }).output)).toBe(min(css));
  });

  test('beautifying twice changes nothing', () => {
    const once = beautifyCss('a,b>c{d:e,f;g:h}@media x{i{j:k}}').output;
    expect(beautifyCss(once).output).toBe(once);
  });

  test('empty input gives nothing', () => {
    expect(beautifyCss('').output).toBe('');
  });
});

test.describe('sizes', () => {
  test('byteLength counts UTF-8 bytes', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('中')).toBe(3);
    expect(byteLength('😀')).toBe(4);
    expect(byteLength('')).toBe(0);
  });

  test('sizeChange', () => {
    expect(sizeChange(200, 150)).toEqual({ before: 200, after: 150, saved: 50, percent: 25 });
    expect(sizeChange(3, 2)).toEqual({ before: 3, after: 2, saved: 1, percent: 33.3 });
    expect(sizeChange(100, 130)).toEqual({ before: 100, after: 130, saved: -30, percent: -30 });
    expect(sizeChange(0, 0)).toEqual({ before: 0, after: 0, saved: 0, percent: 0 });
  });

  test('a real example saves the expected number of bytes', () => {
    const css = 'a {\n  color : red ;\n}\n';
    const out = min(css);
    expect(out).toBe('a{color:red}');
    expect(sizeChange(byteLength(css), byteLength(out))).toEqual({ before: 22, after: 12, saved: 10, percent: 45.5 });
  });
});

test.describe('limits', () => {
  test('blocks nested thousands deep are returned unchanged with a warning', () => {
    const deep = `${'a{'.repeat(20000)}b:c${'}'.repeat(20000)}`;
    for (const result of [minifyCss(deep), beautifyCss(deep)]) {
      expect(result.output).toBe(deep);
      expect(result.warnings.at(-1)).toBe('Blocks are nested too deeply to process; the input is returned unchanged');
    }
  });

  test('a large stylesheet is processed quickly', () => {
    const css = '.a-b:hover > .c { margin: 0.50em 0 0 -1px; color: #ffffff }\n'.repeat(5000);
    const started = Date.now();
    expect(minifyCss(css).output.length).toBe('.a-b:hover>.c{margin:.5em 0 0 -1px;color:#fff}'.length * 5000);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
