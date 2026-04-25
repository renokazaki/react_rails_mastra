class TestController < ApplicationController
    def index
        if params[:param] != nil then
            msg = "hello , " + params[:param] 
        else
            msg = "no param"
        end
        
    end

    def other
        redirect_to action:index, param:"redirect"
    end
end
