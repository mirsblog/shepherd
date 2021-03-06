const JSYAML = require('js-yaml');


let policies={
};

function readPoliciesFromEnv(){
    policies={
        maxReplicasPolicy : process.env.CLUSTER_POLICY_MAX_REPLICAS && parseInt(process.env.CLUSTER_POLICY_MAX_REPLICAS) || 0,
        clusterPolicyMaxCpuRequest : process.env.CLUSTER_POLICY_MAX_CPU_REQUEST || false,
        publicServicesPolicyIpRestrictions : process.env.CLUSTER_POLICY_PUBLIC_SERVICES_IP_RESTRICTIONS || "unchanged",
        removePublicServiceIpRestrictions : process.env.CLUSTER_POLICY_PUBLIC_SERVICES_IP_RESTRICTIONS === "remove"
    };
}


function applyServicePolicies(serviceDoc) {
    let modified = false;
    function applyPublicServicePolicy() {
        if (serviceDoc.metadata && serviceDoc.metadata.labels && serviceDoc.metadata.labels.publicService && policies.removePublicServiceIpRestrictions) {
            console.info("Removing ip restrictions on " + serviceDoc.metadata.name);
            if (serviceDoc.spec && serviceDoc.spec.loadBalancerSourceRanges) {
                modified=true;
                delete serviceDoc.spec.loadBalancerSourceRanges;
            } else {
                console.info("WARNING: Public service defined in " + deploymentfile + "(" + serviceDoc.metadata.name + "), but no loadBalancerSourceRanges set. This means that non-production deployments may be publicly accessible.")
            }
        }
    }

    applyPublicServicePolicy();
    return modified;
}


function applyMaxCpuRequestToContainer(containerspec) {
    if (containerspec.resources && containerspec.resources.requests && containerspec.resources.requests.cpu) {
        console.info("Changing CPU request",containerspec.name, "from", containerspec.resources.requests.cpu, "to", policies.clusterPolicyMaxCpuRequest);
        containerspec.resources.requests.cpu = policies.clusterPolicyMaxCpuRequest;
        return true;
    }
    return false;
}


function applyDeploymentPolicies(deploymentDoc) {
    let modified = false;

    function applyReplicasPolicy() {
        if (policies.maxReplicasPolicy !== 0) {
            if (deploymentDoc.spec && deploymentDoc.spec.replicas > policies.maxReplicasPolicy) {
                console.info("Reducing number of replicas in", deploymentDoc.metadata.name, "from", deploymentDoc.spec.replicas, "to", policies.maxReplicasPolicy);
                modified=true;
                deploymentDoc.spec.replicas = policies.maxReplicasPolicy;
            }
        }
        if(policies.clusterPolicyMaxCpuRequest){
            if(deploymentDoc.spec && deploymentDoc.spec.template && deploymentDoc.spec.template.spec && deploymentDoc.spec.template.spec.containers){
                for(let containerspec of deploymentDoc.spec.template.spec.containers){
                    modified = modified || applyMaxCpuRequestToContainer(containerspec);
                }
            }
        }
    }

    applyReplicasPolicy();
    return modified;
}

function applyHPAPolicies(deploymentDoc) {
    let modified = false;
    function applyReplicasPolicy() {
        if (policies.maxReplicasPolicy !== 0) {
            if (deploymentDoc.spec && deploymentDoc.spec.maxReplicas > policies.maxReplicasPolicy) {
                console.info("Reducing maxreplicas in HPA ", deploymentDoc.metadata.name, "from", deploymentDoc.spec.maxReplicas, "to", policies.maxReplicasPolicy);
                console.info("Reducing minreplicas in HPA ", deploymentDoc.metadata.name, "from", deploymentDoc.spec.minReplicas, "to", policies.maxReplicasPolicy);
                deploymentDoc.spec.maxReplicas = policies.maxReplicasPolicy;
                deploymentDoc.spec.minReplicas = policies.maxReplicasPolicy;
                modified=true;
            }
        }
        if(policies.clusterPolicyMaxCpuRequest){
            if(deploymentDoc.spec && deploymentDoc.spec.template && deploymentDoc.spec.template.spec && deploymentDoc.spec.template.spec.containers){
                for(let containerspec of deploymentDoc.spec.template.spec.containers){
                    applyMaxCpuRequestToContainer(containerspec);
                }
            }
        }
    }

    applyReplicasPolicy();
    return modified;
}

function applyPolicies(parsedDoc) {
    readPoliciesFromEnv();
    let modified = false;
    if (parsedDoc.kind === "Service") {
        modified = modified || applyServicePolicies(parsedDoc);
    }
    if (parsedDoc.kind === "Deployment") {
        modified = modified || applyDeploymentPolicies(parsedDoc)
    }
    if (parsedDoc.kind === "HorizontalPodAutoscaler") {
        modified = modified || applyHPAPolicies(parsedDoc)
    }
    return modified;
}

function applyPoliciesToDoc(rawDoc) {
    readPoliciesFromEnv();
    try {

        let files = rawDoc.split('\n---\n');
        let modified = false;

        let outfiles = "";
        for (let filec of files) {
            if(filec && filec.trim()){
              let parsedDoc = JSYAML.safeLoad(filec);
              modified = modified || applyPolicies(parsedDoc);
              let yml = JSYAML.safeDump(parsedDoc);
              if (outfiles.length > 0) {
                outfiles += "\n---\n"
              }
              outfiles += yml.trim()
            }
        }
        if(modified){
            return outfiles;
        }
        else{
            return rawDoc;

        }
    } catch (e) {
        let error = "There was an error applying cluster policy to deployment document: \n" + e;
        error += 'In document:\n'
        error +=rawDoc;
        throw new Error(error);
    }
}


module.exports = {
    applyPolicies:applyPolicies,
    applyPoliciesToDoc:applyPoliciesToDoc
};
