/** Text the Credits page carries that no source row can: the level note, the Waller and stephenmk credits, the UniDic notice. */
export const LEVEL_NOTE =
  "Every JLPT level shown here is an estimate. The JLPT has published no official vocabulary, kanji or grammar lists since 2010, so the levels come from community lists.";

export type Credited = { name: string; href: string; role: string };

export const LEVEL_CREDITS: Credited[] = [
  { name: "Jonathan Waller", href: "http://www.tanos.co.uk/jlpt/", role: "whose JLPT vocabulary, kanji and grammar lists most level estimates trace back to." },
  { name: "stephenmk", href: "https://github.com/stephenmk/yomitan-jlpt-vocab", role: "whose yomitan-jlpt-vocab maps those vocabulary lists onto JMdict entries." },
];

export const UNIDIC_NOTICE = {
  heading: "UniDic",
  lead: "This app uses UniDic for pitch accent. Copyright (c) 2023 National Institute for Japanese Language and Linguistics. Used under the modified BSD licence:",
  licence: [
    "Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:",
    "1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.",
    "2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.",
    "3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.",
    'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
  ],
};
