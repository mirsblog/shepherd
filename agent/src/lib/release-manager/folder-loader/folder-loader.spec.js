const DirScan = require('.');

describe('k8s deployment file directory structure release plan loader', function () {
    let modifiedState,scanDir;

    let plan={
        addedK8sDeployments:{},
        addDeployment(deployment){
            return new Promise(function(resolve, reject){
                plan.addedK8sDeployments[deployment.identifier] = deployment;
                resolve({fakeState:true});
            });

        }
    };

    beforeEach(function(){
        modifiedState=undefined;
        scanDir = DirScan(inject({
            kubeSupportedExtensions : {
                '.yml':true,
                '.yaml':true,
                '.json':true
            }
        }))
    });

    describe('successful load', function () {

        beforeEach(function (done) {
            process.env.SUB_DOMAIN_PREFIX='testing1234';
            process.env.PREFIXED_TOP_DOMAIN_NAME='testing12345';
            process.env.EXPORT1='testing123';
            process.env.EXPORT2='testing123';
            process.env.CLUSTER_POLICY_MAX_CPU_REQUEST='25m';
            process.env.www_icelandair_com_image='www-icelandair-image:1.0';
            process.env.www_icelandair_com_deleted_image='';
            scanDir('/testdata/deployment-dirs').then(function (plans) {
                Promise.each(plans, function (deploymentPlan) {
                    plan.addDeployment(deploymentPlan);
                }).then(done);
            })
        });

        it('should expand env variables in deployment file on load', function () {
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-fromdir'].descriptor).not.to.contain('${TPL_DOCKER_IMAGE}');
        });

        it('should expand env variables in deployment file on load, using handlebars template format', function () {
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-fromdir'].descriptor).not.to.contain('{{{TPL_DOCKER_IMAGE}}}');
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-fromdir'].descriptor).to.contain("secondaryImage: 'www-icelandair-image:1.0'");
        });

        it('should add origin to plan', function () {
            expect(plan.addedK8sDeployments['Service_www-icelandair-com-fromdir'].origin).to.be('/testdata/deployment-dirs/www-icelandair-com');
        });

        it('should result in exactly those plans', function () {
            expect(Object.keys(plan.addedK8sDeployments).sort().join(',')).to.be('Deployment_www-icelandair-com-deleted,Deployment_www-icelandair-com-fromdir,Namespace_monitors,Service_www-icelandair-com-fromdir,Service_www-icelandair-com-internal-fromdir');
        });

        it('all versions should be immutable', function () {
            expect(plan.addedK8sDeployments['Service_www-icelandair-com-fromdir'].version).to.be('immutable');
        });

        it('default operation should be apply', function () {
            expect(plan.addedK8sDeployments['Service_www-icelandair-com-fromdir'].operation).to.be('apply');
        });

        it('operation of file in directory with delete marker should be delete', function () {
            expect(plan.addedK8sDeployments['Namespace_monitors'].operation).to.be('delete');
        });

        it('should apply k8s deployment-time cluster policy', function () {
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-fromdir'].descriptor).to.contain('25m');
        });

        it('should add k8s deployment to plan for each file under k8s identifier', function () {
            expect(plan.addedK8sDeployments['Service_www-icelandair-com-fromdir']).to.be.ok();
        });

        it('should expand folder_name_image as TPL_DOCKER_IMAGE for variable substitution in deployment files', function () {
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-fromdir'].descriptor).to.contain('www-icelandair-image:1.0')
        });

        it('should mark deployment for delete if folder_name_image variable is set and empty', function () {
            expect(plan.addedK8sDeployments['Deployment_www-icelandair-com-deleted'].operation).to.be('delete')
        });

    });

});