const Express = require("express");
const Morgan = require("morgan");

const PORT = 8001;

const app = Express();

app.use(Morgan("common"));
app.use(Express.urlencoded({ extended: true }));

app.use("/", Express.static(__dirname + "/htdocs"));
app.use("/src", Express.static(__dirname + "/src"));
app.use("/cesium", Express.static(__dirname + "/node_modules/cesium/Build/CesiumUnminified"));
app.get("/", (req, res) => { res.redirect("index.html"); });

app.listen(PORT, () => { console.log('listening on port ' + PORT)});
