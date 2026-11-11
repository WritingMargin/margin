## Explore both perspectives

This sample checks whether interactive content remains useful outside the website.

[Tabs title="Two perspectives"]
[Tab title="For readers"]
Read at your own pace. Both panels should appear in exports.
[/Tab]
[Tab title="For writers"]
Keep the evidence alongside the argument. This second panel must not disappear.
[/Tab]
[/Tabs]

## A small gallery

[Carousel title="Two moments"]
[Image src="http://127.0.0.1:54939/sample-one.svg" alt="Green landscape" caption="First slide: a quiet morning."]
[Image src="http://127.0.0.1:54939/sample-two.svg" alt="Blue landscape" caption="Second slide: an evening reflection."]
[/Carousel]

## Video

[Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Example video" caption="Open the video online; playback is not part of a printed page."]

## Chart: response times

The cache reduces latency at all three traffic levels.

[Chart]
{
  "title": "Response times",
  "type": "bar",
  "labels": ["10", "50", "100"],
  "xLabel": "Requests",
  "yLabel": "Milliseconds",
  "series": [
    {"name": "Without cache", "values": [24, 42, 78]},
    {"name": "With cache", "values": [12, 16, 21]}
  ]
}
[/Chart]

## Diagram: the request path

[Diagram]
flowchart LR
  A[Reader] --> B[Margin]
  B --> C[Article]
[/Diagram]

## An interactive scene

[Scene]
{
  "title": "Explore the geometry",
  "description": "A compute node and its data store.",
  "objects": [
    {"shape": "box", "label": "Compute node", "position": [-1, 0, 0], "color": "#648774"},
    {"shape": "sphere", "label": "Data store", "position": [1, 0, 0], "color": "#668aaa"}
  ]
}
[/Scene]

The online article offers the interactive versions of these examples.
