function errorCheck() {}

moduel.exports = async function createOpenAIModel(request, response) {
  const { body } = request;
  const dataKeys = Array.from(Object.keys(body));
  const estimated = dataKeys.includes("estimate") && body["estimate"] == "y";

  if (estimated) {
    var cond = false;
    cond =
      dataKeys.includes("csvUrl") && body["csvUrl"] != ""
        ? dataKeys.includes("model") && body["model"] != ""
          ? true
          : response
              .status(500)
              .send({ error: "Internal app error: Model not provided" })
        : response
            .status(500)
            .send({ error: "Internal app error: CSV URL not provided" });

    if (cond == true) {
      const csvUrlResponse = await axios.get(body["csvUrl"], {
        responseType: "stream",
      });

      var arr = [];
      var charLength = 0;

      await csvUrlResponse.data
        .pipe(csv())
        .on("data", function (row) {
          arr.push(row);
          charLength += JSON.stringify(Object.values(row))
            .replaceAll("[", "")
            .replaceAll("]", "").length;
        })
        .on("end", async function () {
          var fileSize = await axios.get(body["csvUrl"]).then((response) => {
            return response.data.length / 1000;
          });
          var condi = true;
          const n_epochs = body["n_epochs"] ? body["n_epochs"] : 2;
          var count = (charLength / 4) * n_epochs;

          switch (body["model"]) {
            case "davinci":
              var n = 0.00003;
              break;
            case "curie":
              var n = 0.000003;
              break;
            case "babbage":
              var n = 0.0000006;
              break;
            case "ada":
              var n = 0.0000004;
              break;
            default:
              condi = false;
              csvUrlResponse
                .status(500)
                .send({ error: "Internal app error: Model is incorrect" });
              break;
          }

          if (condi == true) {
            count = (count * n).toFixed(2);
            if (count < 0.01) {
              csvUrlResponse.status(200).send({
                estimate: `<$0.01`,
                num_records: arr.length,
                num_chars: charLength,
                file_size: fileSize,
              });
            } else {
              csvUrlResponse.status(200).send({
                estimate: `~$${count}`,
                num_records: arr.length,
                num_chars: charLength,
                file_size: fileSize,
              });
            }
          }
        });
    }
  } else {
    if (dataKeys.includes("free") && body["free"] == "yes") {
      var cond = false;
      cond =
        dataKeys.includes("csvUrl") && body["csvUrl"] != ""
          ? dataKeys.includes("apiKey") && body["apiKey"] != ""
            ? dataKeys.includes("model") && body["model"] != ""
              ? true
              : response
                  .status(500)
                  .send({ error: "Internal app error: Model not provided" })
            : response
                .status(500)
                .send({ error: "Internal app error: API key not provided" })
          : response
              .status(500)
              .send({ error: "Internal app error: CSV URL not provided" });
      if (cond == true) {
        if (!body["csvUrl"].includes(".csv")) {
          response.status(500).send({
            error:
              "Internal app error: Invalid file format, please upload a valid .csv file",
          });
        } else {
          var arr = [];
          var charLength = 0;

          await axios
            .get(body["csvUrl"], { responseType: "stream" })
            .then(async (response) => {
              await response.data
                .pipe(csv())
                .on("data", function (row) {
                  arr.push(row);
                  charLength += JSON.stringify(Object.values(row))
                    .replaceAll("[", "")
                    .replaceAll("]", "").length;
                })
                .on("end", async function () {
                  var colOne = Object.keys(arr[0])[0];
                  var colTwo = Object.keys(arr[0])[1];

                  const arr2 = arr.map((item) => ({
                    prompt: item[colOne] + "\n\n###\n\n",
                    completion: " " + item[colTwo] + " END",
                  }));

                  var fileSize = await axios
                    .get(body["csvUrl"])
                    .then((response) => {
                      return response.data.length / 1000;
                    });

                  const filename = uuidv4() + ".jsonl";
                  await fs.writeFile(
                    filename,
                    JSON.stringify(arr2.slice(0, 10))
                      .replaceAll("[", "")
                      .replaceAll("]", "")
                      .replaceAll("},{", "}\n{")
                  );

                  const configuration = new Configuration({
                    apiKey: body["apiKey"],
                  });
                  const openai = new OpenAIApi(configuration);
                  await openai
                    .createFile(fss.createReadStream(filename), "fine-tune")
                    .then(async (responses) => {
                      await openai
                        .createFineTune({
                          training_file: responses.data.id,
                          model: body["model"] ? body["model"] : "davinci",
                          n_epochs: body["n_epochs"] ? body["n_epochs"] : 2,
                          suffix: body["model_name"]
                            ? "trial-" + body["model_name"]
                            : "trial-my-model",
                        })
                        .then((response2) => {
                          response.status(200).send({
                            message: "Success",
                            id: response2.data.id,
                            num_records: arr.length,
                            num_chars: charLength,
                            file_size: fileSize,
                          });
                        })
                        .catch((err) => {
                          response.status(401).send({
                            error: "OpenAI error: " + err.message,
                            message: "Creation failed",
                          });
                        });
                    })
                    .catch((err) => {
                      response.status(401).send({
                        error: "OpenAI error: " + err.message,
                        message: "Invalid API key",
                      });
                    });

                  await fs.unlink(filename);
                })
                .on("error", function (error) {
                  response.status(response.status).send({
                    error: "Internal app error: " + response.error,
                    message:
                      "Issue uploading your file, please re-upload and try again",
                  });
                });
            })
            .catch((err) => {
              response
                .status(403)
                .send({ error: "Internal app error: CSV URL unreadable" });
            });
        }
      }
    } else {
      var cond = false;
      cond =
        dataKeys.includes("csvUrl") && body["csvUrl"] != ""
          ? dataKeys.includes("apiKey") && body["apiKey"] != ""
            ? dataKeys.includes("model") && body["model"] != ""
              ? true
              : response
                  .status(500)
                  .send({ error: "Internal app error: Model not provided" })
            : response
                .status(500)
                .send({ error: "Internal app error: API key not provided" })
          : response
              .status(500)
              .send({ error: "Internal app error: CSV URL not provided" });
      if (cond == true) {
        if (!body["csvUrl"].includes(".csv")) {
          response.status(500).send({
            error:
              "Internal app error: Invalid file format, please upload a valid .csv file",
          });
        } else {
          var arr = [];
          var charLength = 0;

          await axios
            .get(body["csvUrl"], { responseType: "stream" })
            .then(async (response) => {
              await response.data
                .pipe(csv())
                .on("data", function (row) {
                  arr.push(row);
                  charLength += JSON.stringify(Object.values(row))
                    .replaceAll("[", "")
                    .replaceAll("]", "").length;
                })
                .on("end", async function () {
                  var colOne = Object.keys(arr[0])[0];
                  var colTwo = Object.keys(arr[0])[1];

                  const arr2 = arr.map((item) => ({
                    prompt: item[colOne] + "\n\n###\n\n",
                    completion: " " + item[colTwo] + " END",
                  }));

                  var fileSize = await axios
                    .get(body["csvUrl"])
                    .then((response) => {
                      return response.data.length / 1000;
                    });

                  const filename = uuidv4() + ".jsonl";
                  await fs.writeFile(
                    filename,
                    JSON.stringify(arr2)
                      .replaceAll("[", "")
                      .replaceAll("]", "")
                      .replaceAll("},{", "}\n{")
                  );

                  const configuration = new Configuration({
                    apiKey: body["apiKey"],
                  });
                  const openai = new OpenAIApi(configuration);
                  await openai
                    .createFile(fss.createReadStream(filename), "fine-tune")
                    .then(async (responses) => {
                      await openai
                        .createFineTune({
                          training_file: responses.data.id,
                          model: body["model"] ? body["model"] : "davinci",
                          n_epochs: body["n_epochs"] ? body["n_epochs"] : 2,
                          suffix: body["model_name"]
                            ? body["model_name"]
                            : "my-model",
                        })
                        .then((response2) => {
                          response.status(200).send({
                            message: "Success",
                            id: response2.data.id,
                            num_records: arr.length,
                            num_chars: charLength,
                            file_size: fileSize,
                          });
                        })
                        .catch((err) => {
                          response.status(err.response.status).send({
                            error:
                              "Open AI error: " +
                              err.response.data.error.message,
                          });
                        });
                    })
                    .catch((err) => {
                      response.status(err.response.status).send({
                        error:
                          "Open AI error: " + err.response.data.error.message,
                      });
                    });
                  await fs.unlink(filename);
                })
                .on("error", function (error) {
                  response.status(response.status).send({
                    error: "Internal app error: " + response.error,
                    message:
                      "Issue uploading your file, please re-upload and try again",
                  });
                });
            })
            .catch((err) => {
              response
                .status(403)
                .send({ error: "Internal app error: CSV URL unreadable" });
            });
        }
      }
    }
  }
};
