Your heart is a meeting point between two journeys: one to the lungs, one to the rest of the body. Understanding those journeys makes its anatomy much easier to remember.

## A beating heart, in three dimensions

Drag the model to view it from any angle. Pause the heartbeat to inspect the shape, or switch on wireframe to see the actual mesh. This exterior model complements the cutaway and blood-flow journey below.

[Scene height="480"]
{
  "title": "A heart in three dimensions",
  "poster": {"src": "/assets/heart-poster.jpg", "alt": "Static front view of the original schematic 3D heart: coral muscular chambers, aortic arch and blue pulmonary vessels."},
  "description": "Original schematic exterior model. Drag to orbit and inspect its depth. The visible pulse is an exaggerated teaching animation at 72 beats/minute, not a measured heartbeat or a simulation of chamber pressures. Blue and coral vessels are diagram colours.",
  "background": "#f7f0e6",
  "objects": [
    {
      "shape": "model",
      "label": "Human heart \u00b7 schematic exterior",
      "src": "/assets/heart.glb",
      "color": "#b44544",
      "pulse": {
        "bpm": 72,
        "amplitude": 0.09
      }
    }
  ]
}
[/Scene]

## Four chambers. Two connected circuits.

The upper chambers, the **atria**, receive blood. The lower chambers, the **ventricles**, pump it out. The septum separates the right and left sides. [Source: NIH — heart anatomy](https://www.nhlbi.nih.gov/health/heart/anatomy).

Press **Play flow** to follow one drop, or choose a stage to advance at your own pace. Pause, restart, or change the speed. Switch to **Explore anatomy** to select structures. The expanded view keeps your place in the journey. Blue marks blood with less oxygen; coral marks blood with more oxygen. **Blood is always red**—these colours are a teaching convention.

[Illustration]
{
  "title": "Inside the human heart",
  "description": "An original, simplified cutaway. Right and left refer to the person, so the right heart appears on your left. Vessels and valve positions are separated for clarity; this is not a diagnostic or to-scale model.",
  "width": 600,
  "height": 600,
  "background": "#f7f0e6",
  "shapes": [
    {
      "path": "M311 245 L306 130 C298 51 422 37 443 113 L465 193 L421 208 L400 130 C391 97 352 106 354 135 L358 249 Z",
      "fill": "#b95952",
      "strokeWidth": 3,
      "region": "ao",
      "stroke": "#8f423e"
    },
    {
      "path": "M329 90 L318 40 L339 34 L351 83 Z",
      "fill": "#b95952",
      "strokeWidth": 2,
      "region": "ao"
    },
    {
      "path": "M363 77 L364 27 L386 28 L387 77 Z",
      "fill": "#b95952",
      "strokeWidth": 2,
      "region": "ao"
    },
    {
      "path": "M401 87 L420 43 L439 53 L422 99 Z",
      "fill": "#b95952",
      "strokeWidth": 2,
      "region": "ao"
    },
    {
      "path": "M139 109 L179 107 L188 258 L144 263 Z",
      "fill": "#6c8ba5",
      "strokeWidth": 3,
      "region": "vc",
      "stroke": "#4d6c8a"
    },
    {
      "path": "M155 390 L194 386 L190 485 L150 482 Z",
      "fill": "#6c8ba5",
      "strokeWidth": 3,
      "region": "vc",
      "stroke": "#4d6c8a"
    },
    {
      "path": "M394 221 L490 192 L500 218 L403 252 Z",
      "fill": "#c9756c",
      "strokeWidth": 3,
      "region": "pv",
      "stroke": "#a15550"
    },
    {
      "path": "M399 257 L495 249 L498 278 L399 287 Z",
      "fill": "#c9756c",
      "strokeWidth": 3,
      "region": "pv",
      "stroke": "#a15550"
    },
    {
      "path": "M292 228 C253 169 185 179 149 220 C109 267 119 338 161 389 C211 452 291 498 377 555 C426 521 470 410 467 324 C467 242 417 192 368 209 C336 216 313 221 292 228 Z",
      "fill": "#c7796b",
      "strokeWidth": 4,
      "stroke": "#97574f"
    },
    {
      "path": "M278 241 C244 202 184 207 163 241 C144 272 155 301 185 310 L237 305 C263 289 273 266 278 241 Z",
      "fill": "#96b4c7",
      "strokeWidth": 3,
      "region": "ra",
      "stroke": "#587c98"
    },
    {
      "path": "M176 332 C175 384 230 428 296 468 C280 402 280 346 251 325 C228 319 201 326 176 332 Z",
      "fill": "#799ab8",
      "strokeWidth": 3,
      "region": "rv",
      "stroke": "#4c7393"
    },
    {
      "path": "M341 243 C356 215 401 224 422 248 C438 268 430 296 403 302 L355 298 C345 282 337 266 341 243 Z",
      "fill": "#e9b1a0",
      "strokeWidth": 3,
      "region": "la",
      "stroke": "#b86e62"
    },
    {
      "path": "M348 329 C324 365 332 449 378 506 C411 458 439 369 416 331 C394 322 367 325 348 329 Z",
      "fill": "#d78073",
      "strokeWidth": 3,
      "region": "lv",
      "stroke": "#a95750"
    },
    {
      "path": "M237 347 C235 290 239 232 257 183 C274 142 314 124 345 120 L352 155 C318 164 301 178 292 210 L276 347 Z",
      "fill": "#7a9fba",
      "strokeWidth": 3,
      "region": "pa",
      "stroke": "#527c9a"
    },
    {
      "path": "M278 178 L224 151 L236 124 L305 151 Z",
      "fill": "#7a9fba",
      "strokeWidth": 3,
      "region": "pa",
      "stroke": "#527c9a"
    },
    {
      "path": "M335 353 C318 308 316 251 316 199 L350 194 C349 249 349 285 365 336 Z",
      "fill": "#d38573",
      "strokeWidth": 3,
      "region": "ao",
      "stroke": "#ac6558"
    },
    {
      "path": "M294 300 C286 349 292 430 321 481 L340 496 C320 426 316 349 319 304 Z",
      "fill": "#b9675c",
      "strokeWidth": 2,
      "region": "sep",
      "stroke": "#9f574e"
    },
    {
      "path": "M178 308 L215 319 L204 338 Z M215 319 L250 307 L232 339 Z",
      "fill": "#f8e6bc",
      "strokeWidth": 2,
      "region": "tv",
      "stroke": "#a18a59"
    },
    {
      "path": "M344 303 L375 315 L359 335 Z M375 315 L411 305 L393 336 Z",
      "fill": "#f8e6bc",
      "strokeWidth": 2,
      "region": "mv",
      "stroke": "#a18a59"
    },
    {
      "path": "M315 194 L333 208 L315 219 Z M333 208 L351 194 L351 219 Z",
      "fill": "#f8e6bc",
      "strokeWidth": 2,
      "region": "av",
      "stroke": "#a18a59"
    },
    {
      "path": "M250 248 L268 263 L249 276 Z M268 263 L288 248 L284 278 Z",
      "fill": "#f8e6bc",
      "strokeWidth": 2,
      "region": "plv",
      "stroke": "#a18a59"
    }
  ],
  "regions": [
    {
      "id": "ra",
      "label": "Right atrium",
      "x": 195,
      "y": 250,
      "description": "Receives oxygen-poor blood returning from the body. Blood then crosses the tricuspid valve into the right ventricle.",
      "color": "#496b9a"
    },
    {
      "id": "rv",
      "label": "Right ventricle",
      "x": 229,
      "y": 386,
      "description": "Pumps blood through the pulmonary valve and pulmonary artery towards the lungs. The right heart supplies the pulmonary circuit.",
      "color": "#496b9a"
    },
    {
      "id": "la",
      "label": "Left atrium",
      "x": 382,
      "y": 247,
      "description": "Receives oxygen-rich blood from the lungs through the pulmonary veins. Blood then passes through the mitral valve.",
      "color": "#b34b49"
    },
    {
      "id": "lv",
      "label": "Left ventricle",
      "x": 370,
      "y": 400,
      "description": "Pumps oxygen-rich blood through the aortic valve and aorta to the body. Its muscular wall generates the pressure needed for this journey.",
      "color": "#b34b49"
    },
    {
      "id": "vc",
      "label": "Venae cavae",
      "x": 161,
      "y": 153,
      "description": "The superior and inferior vena cava return blood from the body to the right atrium.",
      "color": "#496b9a"
    },
    {
      "id": "pa",
      "label": "Pulmonary artery",
      "x": 298,
      "y": 165,
      "description": "Carries blood away from the right ventricle to the lungs. An artery is defined by flow away from the heart, not by oxygen content.",
      "color": "#496b9a"
    },
    {
      "id": "pv",
      "label": "Pulmonary veins",
      "x": 459,
      "y": 232,
      "description": "Bring oxygen-rich blood from the lungs back to the left atrium. Veins carry blood towards the heart.",
      "color": "#b34b49"
    },
    {
      "id": "ao",
      "label": "Aorta",
      "x": 380,
      "y": 100,
      "description": "The main artery leaving the left ventricle distributes oxygen-rich blood to the body.",
      "color": "#b34b49"
    },
    {
      "id": "tv",
      "label": "Tricuspid valve",
      "x": 213,
      "y": 311,
      "description": "Between the right atrium and right ventricle. Like the other heart valves, it helps prevent backward flow.",
      "color": "#82704e"
    },
    {
      "id": "mv",
      "label": "Mitral valve",
      "x": 374,
      "y": 311,
      "description": "Between the left atrium and left ventricle. It helps keep blood moving in one direction.",
      "color": "#82704e"
    },
    {
      "id": "av",
      "label": "Aortic valve",
      "x": 335,
      "y": 205,
      "description": "At the outlet from the left ventricle into the aorta. This simplified cutaway separates the outlets for clarity.",
      "color": "#82704e"
    },
    {
      "id": "plv",
      "label": "Pulmonary valve",
      "x": 270,
      "y": 261,
      "description": "At the outlet from the right ventricle into the pulmonary artery. Valves open and close as pressure changes during the heartbeat.",
      "color": "#82704e"
    },
    {
      "id": "sep",
      "label": "Septum",
      "x": 309,
      "y": 407,
      "description": "The internal wall separating the right and left sides of the heart. The chambers are spaces; the surrounding tissue does the pumping.",
      "color": "#82704e"
    }
  ],
  "flow": {
    "title": "Follow one drop of blood",
    "description": "Blue: less oxygen · Coral: more oxygen. A simplified route, not a heartbeat simulation: both sides pump together, and stage durations are for teaching only. Lungs and body routes are shown outside the heart.",
    "secondsPerStep": 4,
    "steps": [
      {
        "label": "Body → right atrium",
        "description": "Blood returning from the body enters the right atrium through the venae cavae.",
        "points": [
          [
            80,
            530
          ],
          [
            80,
            100
          ],
          [
            160,
            100
          ],
          [
            170,
            240
          ],
          [
            194,
            273
          ]
        ],
        "color": "#315e9b",
        "region": "ra"
      },
      {
        "label": "Right atrium → right ventricle",
        "description": "Blood crosses the tricuspid valve to reach the right ventricle.",
        "points": [
          [
            194,
            273
          ],
          [
            213,
            320
          ],
          [
            215,
            355
          ],
          [
            240,
            400
          ]
        ],
        "color": "#315e9b",
        "region": "tv"
      },
      {
        "label": "Right ventricle → lungs",
        "description": "Blood leaves through the pulmonary valve and pulmonary artery, travelling to the lungs.",
        "points": [
          [
            240,
            400
          ],
          [
            255,
            340
          ],
          [
            270,
            260
          ],
          [
            275,
            200
          ],
          [
            300,
            160
          ],
          [
            350,
            138
          ],
          [
            520,
            138
          ],
          [
            520,
            80
          ]
        ],
        "color": "#315e9b",
        "region": "plv"
      },
      {
        "label": "In the lungs",
        "description": "Blood gains oxygen in the lungs. The dot changes from blue to coral to mark that change; real blood is always red.",
        "points": [
          [
            520,
            80
          ],
          [
            555,
            80
          ]
        ],
        "color": "#315e9b",
        "endColor": "#b33f36"
      },
      {
        "label": "Lungs → left atrium",
        "description": "Pulmonary veins carry oxygen-rich blood back to the left atrium.",
        "points": [
          [
            555,
            80
          ],
          [
            560,
            205
          ],
          [
            490,
            205
          ],
          [
            422,
            235
          ],
          [
            385,
            265
          ]
        ],
        "color": "#b33f36",
        "region": "la"
      },
      {
        "label": "Left atrium → left ventricle",
        "description": "Blood crosses the mitral valve into the left ventricle.",
        "points": [
          [
            385,
            265
          ],
          [
            374,
            315
          ],
          [
            385,
            360
          ],
          [
            385,
            430
          ]
        ],
        "color": "#b33f36",
        "region": "mv"
      },
      {
        "label": "Left ventricle → body",
        "description": "Blood leaves through the aortic valve and aorta to supply the body.",
        "points": [
          [
            385,
            430
          ],
          [
            355,
            350
          ],
          [
            333,
            280
          ],
          [
            333,
            200
          ],
          [
            330,
            130
          ],
          [
            345,
            100
          ],
          [
            380,
            95
          ],
          [
            415,
            130
          ],
          [
            440,
            195
          ],
          [
            520,
            350
          ],
          [
            530,
            520
          ]
        ],
        "color": "#b33f36",
        "region": "av"
      },
      {
        "label": "In the body",
        "description": "Tissues take up oxygen. Blood then returns to the heart, ready for another journey.",
        "points": [
          [
            530,
            520
          ],
          [
            530,
            580
          ],
          [
            80,
            580
          ],
          [
            80,
            530
          ]
        ],
        "color": "#b33f36",
        "endColor": "#315e9b"
      }
    ],
    "landmarks": [
      {
        "label": "LUNGS",
        "x": 525,
        "y": 50
      },
      {
        "label": "BODY",
        "x": 310,
        "y": 575
      }
    ]
  },
  "poster": {
    "src": "/assets/heart-cutaway.jpg",
    "alt": "Numbered schematic heart cutaway. Blue chambers are the right heart; coral chambers are the left heart. Numbers match the structure descriptions below."
  }
}
[/Illustration]

The lung and body stages mark oxygen exchange. This is a route through the circulation, not a model of valve timing or blood speed. [Source: NIH — blood flow](https://www.nhlbi.nih.gov/health/heart/blood-flow).

## Follow a drop of blood

**Body → right atrium → right ventricle → lungs → left atrium → left ventricle → body.** This is one continuous circuit, with a valve at each ventricular inlet and outlet. [Source: CDC — how the heart works](https://www.cdc.gov/heart-defects/how-the-heart-works/index.html).

[Diagram]
flowchart LR
  B[Body] --> RA[Right atrium]
  RA -->|Tricuspid valve| RV[Right ventricle]
  RV -->|Pulmonary valve and artery| L[Lungs]
  L -->|Pulmonary veins| LA[Left atrium]
  LA -->|Mitral valve| LV[Left ventricle]
  LV -->|Aortic valve and aorta| B
[/Diagram]

Notice the naming rule: arteries carry blood **away** from the heart, while veins carry it **towards** the heart. The pulmonary artery carries oxygen-poor blood; the pulmonary veins return oxygen-rich blood. [Source: NIH — blood flow](https://www.nhlbi.nih.gov/health/heart/blood-flow).

## What makes the chambers move?

An electrical signal begins in the sinoatrial node in the right atrium. It spreads through the atria, pauses at the atrioventricular node, then travels through the ventricular conduction system. This timing coordinates contraction: the atria help fill the ventricles before the ventricles pump.

The autonomic nervous system adjusts this rhythm. Sympathetic activity can increase heart rate; parasympathetic activity can slow it. The heart has its own pacemaker, but it responds to the body's needs. [Source: NIH — how the heart beats](https://www.nhlbi.nih.gov/health/heart/heart-beats).

## Test your understanding

Try answering before opening the explanation.

[Tabs title="Check your understanding" variant="pills"]
[Tab title="Question"]
Blood has just returned from the lungs. Which chamber does it enter next, and where does it go afterwards?
[/Tab]
[Tab title="Explanation"]
It enters the **left atrium**, crosses the **mitral valve** into the **left ventricle**, then leaves through the **aortic valve** into the **aorta**. Locate these structures in the atlas above.
[/Tab]
[/Tabs]

## Reading the model responsibly

This illustration prioritises the connections between structures. It does not reproduce their exact proportions or three-dimensional arrangement. The coronary vessels, which supply the heart muscle itself, are omitted. Use the linked anatomical references for a more complete view.

*Science notes · Introductory anatomy · Sources checked 16 October 2026.*
