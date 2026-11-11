A car looks like one object. Look beneath its surface and it becomes a collection of systems: a structure to carry the load, an energy store, a motor, and wheels that meet the road. This field guide uses an electric coupe to make those relationships visible.

## Start with the shape

Drag the car to orbit it, use **+ / −** to zoom, or turn on **Wireframe** to inspect its mesh. Look at the wheel rims from the side, then orbit towards the front: the changing overlap and perspective reveal real depth.

[Scene height="500"]
{
  "title": "Explore the electric coupe",
  "description": "An original schematic car made from real three-dimensional geometry. Orbit it to see the wheel depth, glazing, curved body and underside. It is not a manufacturer model or an engineering drawing.",
  "background": "#edf1ef",
  "objects": [
    {
      "shape": "model",
      "label": "Electric coupe · complete exterior",
      "description": "The assembled view shows the outer proportions. Compare it with the separated components below to see where the energy system fits.",
      "src": "/assets/car.glb",
      "color": "#477c71",
      "rotation": [
        0,
        -0.35,
        0
      ]
    }
  ],
  "poster": {
    "src": "/assets/car-poster.jpg",
    "alt": "Front three-quarter view of the original green electric coupe, with dark glazing and four detailed wheels."
  }
}
[/Scene]

## Lift the body. Find the systems.

The exploded view separates six assemblies. **Click a visible component or its labelled button** to highlight it and read what it does. Try the traction battery first, then compare the motor with the power electronics above it. Rotation changes your viewpoint; it does not alter the component layout.

[Scene height="620"]
{
  "title": "An electric car, layer by layer",
  "description": "Select a component in the model or use the labelled buttons. The separated positions are an explanatory exploded view, not an assembly procedure.",
  "background": "#edf1ef",
  "objects": [
    {
      "shape": "model",
      "label": "Body and cabin",
      "description": "The outer shell defines the silhouette and encloses the cabin. This schematic omits detailed crash structures and interior trim.",
      "src": "/assets/car-body.glb",
      "color": "#477c71",
      "position": [
        0,
        2.74501,
        0
      ],
      "scale": 1.796154
    },
    {
      "shape": "model",
      "label": "Chassis and axles",
      "description": "The frame supports the main assemblies. Axles are simplified here; real suspension and steering linkages contain many more parts.",
      "src": "/assets/car-chassis.glb",
      "color": "#39474b",
      "position": [
        0,
        0.08,
        0
      ],
      "scale": 1.519231
    },
    {
      "shape": "model",
      "label": "Traction battery",
      "description": "Stores electrical energy for propulsion. Here the flat pack sits between the axles, below the cabin.",
      "src": "/assets/car-battery.glb",
      "color": "#d8ab55",
      "position": [
        -0.05,
        0.856,
        0
      ],
      "scale": 0.953846
    },
    {
      "shape": "model",
      "label": "Motor and reduction gear",
      "description": "The electric motor produces torque. A reduction gear passes that torque to the driven wheels; this example illustrates rear-wheel drive.",
      "src": "/assets/car-drive.glb",
      "color": "#638fa7",
      "position": [
        -2.1,
        1.3,
        0.1025
      ],
      "scale": 0.313462
    },
    {
      "shape": "model",
      "label": "Power electronics",
      "description": "Controls electrical power delivered to the traction motor. The orange cable indicates the electrical connection, not a wiring specification.",
      "src": "/assets/car-electronics.glb",
      "color": "#de9055",
      "position": [
        -2.00816,
        1.66377,
        1.38084
      ],
      "scale": 0.332183
    },
    {
      "shape": "model",
      "label": "Wheels and tyres",
      "description": "Tyres are the contact between the vehicle and road. The geometry shows wheel, rim and hub depth; the brakes and suspension are schematic.",
      "src": "/assets/car-wheels.glb",
      "color": "#555f62",
      "position": [
        0,
        0.255,
        0.45
      ],
      "scale": 1.426923
    }
  ],
  "poster": {
    "src": "/assets/car-exploded.jpg",
    "alt": "Exploded car: green body above a gold battery, grey chassis and wheels, with blue motor and orange power electronics separated to the rear."
  }
}
[/Scene]

The traction battery stores the energy that supplies the electric motor. Power electronics control the motor's electrical input, and gearing transfers its output to the driven wheels. This example places the motor at the rear; other cars use different arrangements. [Source: U.S. Department of Energy — electric-car components](https://afdc.energy.gov/vehicles/how-do-all-electric-cars-work).

## Follow the power, one stage at a time

Choose **Play flow** to follow the route, or select a stage to inspect it. Switch to **Explore anatomy** for the five part descriptions. The same expandable atlas used in the heart article works here with a completely different drawing and meaning.

[Illustration]
{
  "title": "From stored energy to moving wheels",
  "description": "A schematic side view of a rear-wheel-drive electric car. Select a numbered part or follow the energy route. The front of the car is on the right; component positions and proportions are simplified.",
  "width": 640,
  "height": 440,
  "background": "#edf1ef",
  "shapes": [
    {
      "path": "M55 310 L60 250 Q65 232 120 228 L206 145 Q220 132 250 132 L378 132 Q400 132 420 156 L486 220 L554 245 Q572 252 575 285 L575 320 L55 320 Z",
      "fill": "#b2cdc3",
      "stroke": "#477c71",
      "strokeWidth": 3,
      "region": "body"
    },
    {
      "path": "M220 155 L274 155 L274 218 L164 218 Z",
      "fill": "#4e6973",
      "region": "body"
    },
    {
      "path": "M288 155 L378 155 L431 218 L288 218 Z",
      "fill": "#4e6973",
      "region": "body"
    },
    {
      "path": "M68 315 h492 v24 h-492 Z",
      "fill": "#68787a"
    },
    {
      "path": "M204 265 h254 v57 h-254 Z",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 3,
      "region": "battery"
    },
    {
      "path": "M90 195 h78 v46 h-78 Z",
      "fill": "#d99b6d",
      "stroke": "#a76b3b",
      "strokeWidth": 2,
      "region": "controller"
    },
    {
      "path": "M91 261 h80 v48 h-80 Z",
      "fill": "#85b2c8",
      "stroke": "#527f97",
      "strokeWidth": 3,
      "region": "motor"
    },
    {
      "path": "M112 350 A48 48 0 1 0 208 350 A48 48 0 1 0 112 350 Z",
      "fill": "#34464d",
      "region": "wheels"
    },
    {
      "path": "M131 350 A29 29 0 1 0 189 350 A29 29 0 1 0 131 350 Z",
      "fill": "#d9e0de",
      "stroke": "#7b8b8e",
      "strokeWidth": 5,
      "region": "wheels"
    },
    {
      "path": "M452 350 A48 48 0 1 0 548 350 A48 48 0 1 0 452 350 Z",
      "fill": "#34464d",
      "region": "body"
    },
    {
      "path": "M471 350 A29 29 0 1 0 529 350 A29 29 0 1 0 471 350 Z",
      "fill": "#d9e0de",
      "stroke": "#7b8b8e",
      "strokeWidth": 5,
      "region": "body"
    },
    {
      "path": "M242 269 L242 317",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 1
    },
    {
      "path": "M282 269 L282 317",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 1
    },
    {
      "path": "M322 269 L322 317",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 1
    },
    {
      "path": "M362 269 L362 317",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 1
    },
    {
      "path": "M402 269 L402 317",
      "fill": "#e5bc68",
      "stroke": "#b58734",
      "strokeWidth": 1
    }
  ],
  "regions": [
    {
      "id": "body",
      "label": "Body and cabin",
      "description": "The body encloses the passenger space. Its silhouette is separate from the underfloor power system in this diagram.",
      "x": 340,
      "y": 170,
      "color": "#477c71"
    },
    {
      "id": "battery",
      "label": "Traction battery",
      "description": "Stores energy. The flat gold pack is shown below the passenger cabin, between the axles.",
      "x": 340,
      "y": 290,
      "color": "#b58734"
    },
    {
      "id": "controller",
      "label": "Power electronics",
      "description": "Controls electrical power supplied to the motor. The diagram separates it from the motor so the connection is easier to follow.",
      "x": 130,
      "y": 220,
      "color": "#ba7543"
    },
    {
      "id": "motor",
      "label": "Traction motor",
      "description": "Converts electrical energy into mechanical rotation. A reduction gear transfers torque to the driven wheels.",
      "x": 130,
      "y": 285,
      "color": "#527f97"
    },
    {
      "id": "wheels",
      "label": "Driven wheels",
      "description": "The rear wheels are driven in this example. The tyre-road contact transmits forces that accelerate or slow the vehicle.",
      "x": 160,
      "y": 360,
      "color": "#536268"
    }
  ],
  "flow": {
    "title": "Follow the power path",
    "description": "Gold and orange show an electrical path; blue shows mechanical power. The moving dot is a teaching cue, not an electron, a measured speed or a representation of electrical current direction.",
    "secondsPerStep": 4,
    "landmarks": [
      {
        "label": "REAR",
        "x": 80,
        "y": 410
      },
      {
        "label": "FRONT",
        "x": 550,
        "y": 410
      }
    ],
    "steps": [
      {
        "label": "Battery → power electronics",
        "description": "The traction battery supplies electrical energy to the power electronics.",
        "points": [
          [
            340,
            294
          ],
          [
            207,
            294
          ],
          [
            190,
            220
          ],
          [
            130,
            220
          ]
        ],
        "color": "#b58734",
        "endColor": "#ba7543",
        "region": "battery"
      },
      {
        "label": "Power electronics → motor",
        "description": "The controller regulates electrical power delivered to the traction motor.",
        "points": [
          [
            130,
            220
          ],
          [
            130,
            245
          ],
          [
            130,
            285
          ]
        ],
        "color": "#ba7543",
        "region": "controller"
      },
      {
        "label": "Motor → driven wheels",
        "description": "The motor produces torque. Gearing and shafts transmit it to the rear wheels.",
        "points": [
          [
            130,
            285
          ],
          [
            130,
            320
          ],
          [
            160,
            350
          ]
        ],
        "color": "#527f97",
        "region": "motor"
      },
      {
        "label": "Tyres → road",
        "description": "Forces at the tyre-road contact accelerate the car. Real systems lose some energy as heat along the way.",
        "points": [
          [
            160,
            350
          ],
          [
            160,
            396
          ],
          [
            350,
            396
          ],
          [
            560,
            396
          ]
        ],
        "color": "#527f97",
        "region": "wheels"
      }
    ]
  },
  "poster": {
    "src": "/assets/car-power-flow.jpg",
    "alt": "Numbered car side view: 1 body, 2 battery, 3 power electronics, 4 motor and 5 driven rear wheels. Front is on the right."
  }
}
[/Illustration]

## A battery is not a motor

Think of three different jobs: **store**, **control**, and **convert**. The battery stores energy. The power electronics control delivery. The motor converts electrical energy into mechanical output. Combining those jobs in a single imagined “engine” makes an electric car harder to understand.

## What changes when the car slows down?

During regenerative braking, the motor can act as a generator, recovering some of the vehicle's kinetic energy as electrical energy. That is a different direction of energy transfer from the driving path above. The animation shows propulsion only; it does not simulate regeneration, braking distances or control software. [Source: NHTSA — electric and hybrid vehicle components](https://www.nhtsa.gov/vehicle-safety/electric-and-hybrid-vehicles).

[Tabs title="Check your understanding"]
[Tab title="Question"]
Which stores the energy, and which produces the mechanical torque: the gold battery pack or the blue motor assembly?
[/Tab]
[Tab title="Explanation"]
The **gold battery pack** stores energy. The **blue motor assembly** produces torque. The power electronics sit between them in the electrical path. Select each assembly in the exploded model to connect its shape with its job.
[/Tab]
[/Tabs]

## Reading this model

This is original teaching geometry, not CAD for a real vehicle. The separation between assemblies is deliberately exaggerated. Suspension, cooling, charging hardware, detailed braking components and the cabin interior are omitted or simplified. The model has no wheel-driving physics or road interaction; auto-rotate moves the view around a stationary object.

*Engineering notes · An introductory electric-car atlas · Sources checked 16 October 2026.*
