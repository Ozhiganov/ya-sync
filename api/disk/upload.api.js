var ApiMethod = require('bla').ApiMethod;
var config = require('./../../config/config');
var vowHandyHttp = require('../../lib/vow-handy-http');
var extend = require('extend');
var checksum = require('checksum');
var fs = require('fs');
var vow = require('vow');
var path = require('path');

/**
 * Загрузка файла
 *
 * curl -v -X PUT
 *  -H 'Authorization: OAuth b56608838c7f4550a88ca629d2f565cd'
 *  -H 'Etag: 6ab3c0414f12590a2e3719a24893ea31'
 *  -H 'Sha256: 54c0bada752032603f9c8e29947e4cfa8819efc6894ab4bdf46388db2156e3b9'
 *  -H 'Expect: 100-continue'
 *  -H 'Content-Type: application/binary'
 *  -H 'Content-Encoding: gzip'
 *  -H 'Content-Length: 103134024' https://webdav.yandex.ru/a/Make --data-binary=@Makefile
 */
module.exports = new ApiMethod({
    name: 'upload',
    description: 'Uploads a file',
    params: {
        localPath: {
            type: 'String',
            description: 'local path to file.',
            required: true
        },
        destination: {
            type: 'String',
            description: 'Remote path to folder without file name. Name = basename(localfile)',
            required: true
        }
    },
    action: function (params) {
        var defer = vow.defer();
        fs.exists(params.localPath, function (exists) {
            if (!exists) {
                defer.reject('File ' + params.localPath + ' does not exists');
            }

            fs.stat(params.localPath, function (error, stat) {
                if (error) {
                    defer.reject(error);
                } else {
                    defer.resolve({'Content-length': stat.size});
                }
            });
        });

        return defer
            .promise()
            .then(function (fileOptions) {
                var md5Defer = vow.defer();
                checksum.file(params.localPath, {algorithm: 'md5'}, function (error, sum) {
                    if (error) {
                        md5Defer.reject(error);
                    }
                    fileOptions.Etag = sum;
                    md5Defer.resolve(fileOptions);
                });
                return md5Defer.promise();
            })
            .then(function (fileOptions) {
                var sha256Defer = vow.defer();
                checksum.file(params.localPath, {algorithm: 'sha256'}, function (error, sum) {
                    if (error) {
                        sha256Defer.reject(error);
                    }
                    fileOptions.Sha256 = sum;
                    sha256Defer.resolve(fileOptions);
                });
                return sha256Defer.promise();
            })
            .then(function (fileOptions) {
                var headers = {
                    data: fs.createReadStream(params.localPath),
                    method: 'PUT',
                    Expect: '100-continue',
                    'Content-Type': 'application/binary',
                    'Content-Encoding': 'gzip'
                };

                var ext = extend(true, {}, config.disk, fileOptions, headers);
                ext.url += path.normalize(params.destination);

                return vowHandyHttp(ext)
                    .then(function (data) {
                        // если ответ пустой значит все ок. 201
                        // в противном случае ошибка
                        if (Boolean(data.toString())) {
                            throw new Error(data.toString());
                        }
                        return true;
                    })
                    .fail(function (error) {
                        throw new Error(error);
                    });
            });
    }
});
